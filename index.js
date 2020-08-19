const core = require('@actions/core');
const url = require('url');
const path = require('path');
const micromatch = require('micromatch');
const ftpClient = require('./ftp');
const sftpClient = require('./sftp');
const utils = require('./utils');

(async () => {
  let client = null;
  let connected = false;

  try {
    const host = core.getInput('host', { required: true });
    const user = core.getInput('user');
    const password = core.getInput('password');
    const privateKey = core.getInput('privateKey');
    const secure = core.getInput('secure');
    const remotePath = (core.getInput('remotePath').trim() || './');
    const localPath = (utils.trimChar(core.getInput('localPath'), '/').trim() || '');
    const ignore = (core.getInput('ignore') || '').split(',').filter(Boolean);
    const actions = core.getInput('actions', { required: true }).split('\n').filter(Boolean);
    
    const availableActions = ['download', 'upload', 'write', 'move', 'delete', 'clean', 'rename'];
    let parsedActions = [];
    
    const hostURL = url.parse(host);
  
    if (user) hostURL.username = user;
    if (password) hostURL.password = password;
  
    if (hostURL.username == '') {
      core.setFailed('User is required');
    }
  
    if (hostURL.pass == '') {
      core.setFailed('Password is required');
    }
  
    if (['ftp:', 'sftp:'].indexOf(hostURL.protocol) === -1) {
      core.setFailed(`${hostURL.protocol} is not supported`);
    }
  
    actions.forEach(action => {
      if (utils.isJson(action)) {
        const json = JSON.parse(action);
        if (json.files && Array.isArray(json.files)) {
          for(file of json.files) {
            if (file.status == 'renamed') {
              parsedActions.push([file.changes ? 'upload' : 'rename', file.previous_filename, path.join(remotePath, file.filename)]);
            }
            else if (file.status == 'added' || file.status == 'modified') {
              parsedActions.push(['upload', file.filename, path.join(remotePath, file.filename)]);
            }
            else if (file.status == 'removed') {
              parsedActions.push(['delete', path.join(remotePath, file.filename)]);
            }
          }
        }
        else if (Array.isArray(json)) {
          for(file of json) {
            parsedActions.push(['upload', file.path, path.join(remotePath, file.path)]);
          }
        }
      }
      else {
        parsedActions.push(action.trim().split(' '));
      }
    });
  
    client = hostURL.protocol === 'ftp:' ? new ftpClient : new sftpClient;
    client.on('connect', info => {
      if (info.status) {
        console.info('Connected!');
        connected = true;
      }
      else core.setFailed('Connecion Failed msg:' + info.msg);
    });
    client.on('download', info => {
      if (info.status) console.log(`Downloaded: ${info.file}`);
      else if (info.ignored) console.warn(`Download Ignored: ${info.file} ${info.msg ? `(msg: ${info.msg})` : ''}`);
      else console.error(`Download Failed: ${info.file} ${info.msg ? `(msg: ${info.msg})` : ''}`);
    });
    client.on('upload', info => {
      if (info.status) console.log(`Uploaded: ${info.file}`);
      else if (info.ignored) console.warn(`Upload Ignored: ${info.file} ${info.msg ? `(msg: ${info.msg})` : ''}`);
      else console.error(`Upload Failed: ${info.file} ${info.msg ? `(msg: ${info.msg})` : ''}`);
    });
    client.on('write', info => {
      if (info.status) console.info(`Written: ${info.file}`);
      else console.error(`Write Failed: ${info.file} ${info.msg ? `(msg: ${info.msg})` : ''}`);
    });
    client.on('move', info => {
      if (info.status) console.info(`Moved: ${info.file}`);
      else console.error(`Move Failed: ${info.file} ${info.msg ? `(msg: ${info.msg})` : ''}`);
    });
    client.on('delete', info => {
      if (info.status) console.info(`Deleted: ${info.file}`);
      else console.error(`Delete Failed: ${info.file} ${info.msg ? `(msg: ${info.msg})` : ''}`);
    });
    client.on('close', info => {
      if (info.status) console.info('Connection closed');
      else console.error('Close connection Failed');
    });
    
    if (ignore.length) {
      client.setFilter(ignore);
    }
  
    await client.connect(hostURL.hostname, hostURL.port, hostURL.username, hostURL.password, hostURL.protocol == 'ftp:' ? (secure && secure !== 'false' ? true : false) : privateKey);
  
    for (const act of parsedActions) {
      if (availableActions.indexOf(act[0]) === -1) {
        core.setFailed(`action ${act[0]} is not exist`);
        continue;
      }
  
      if (act.length > 1) {
        if ((['', './', '.'].indexOf(localPath) === -1 && ! act[1].startsWith(localPath)) ||
            (ignore.length && micromatch.isMatch(act[1], ignore))) {
          
          console.warn(`${utils.capitalize(act[0])} Ignored: ${act[1]}`);
          continue;
        }
      }
  
      await client[act[0]].apply(client, act.slice(1));
    }
  
    await client.close();
  } catch(e) {
    if (client && connected) await client.close();
    core.setFailed(e.message);
  }
})();
