const core = require('@actions/core');
const url = require('url');
const path = require('path');
const fs = require('fs');
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
    const debug = core.getInput('debug') === 'true'
    
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

    const parseJsonAction = (action) => {
      const json = JSON.parse(action);
      if (json.files && Array.isArray(json.files)) {
        for(file of json.files) {
          let remoteFile = file.filename;

          if (['', './', '.'].indexOf(localPath) === -1 && file.filename.startsWith(localPath)) {
            remoteFile = file.filename.substr(localPath.length);
          }

          if (file.status == 'renamed') {
            parsedActions.push([file.changes ? 'upload' : 'move', path.join(remotePath, file.previous_filename), path.join(remotePath, remoteFile)]);
          }
          else if (file.status == 'added' || file.status == 'modified') {
            parsedActions.push(['upload', file.filename, path.join(remotePath, remoteFile)]);
          }
          else if (file.status == 'removed') {
            parsedActions.push(['delete', path.join(remotePath, remoteFile)]);
          }
        }
      }
      else if (Array.isArray(json)) {
        for(file of json) {
          let remoteFile = file.path;

          if (['', './', '.'].indexOf(localPath) === -1 && file.path.startsWith(localPath)) {
            remoteFile = file.path.substr(localPath.length);
          }

          parsedActions.push(['upload', file.path, path.join(remotePath, remoteFile)]);
        }
      }
    }
  
    actions.forEach(action => {
      if (utils.isJson(action)) {
        parseJsonAction(action);
      }
      else if (action.startsWith('file://')) {
        const fileName = action.replace('file://', '');
        if (!fs.existsSync(fileName)) {
          console.error('Action skipped. File ' + fileName + ' not exists');
        }

        const actionData = fs.readFileSync(fileName, 'utf-8');

        if (!utils.isJson(actionData)) {
          console.error('Action skipped. File ' + fileName + ' not contains json');
        }

        parseJsonAction(actionData);
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
  
    await client.connect(hostURL.hostname, hostURL.port, hostURL.username, hostURL.password, hostURL.protocol == 'ftp:' ? (secure && secure !== 'false' ? true : false) : privateKey, debug);
  
    for (const act of parsedActions) {
      if (availableActions.indexOf(act[0]) === -1) {
        core.setFailed(`action "${act[0]}" is not exist`);
        break;
      }

      if (typeof client[act[0]] === 'undefined') {
        core.setFailed(`action "${act[0]}" is undefined`);
        break;
      }
  
      if (act.length > 1) {
        if (act[0].toLowerCase() !== 'write' && 
            ((['', './', '.'].indexOf(localPath) === -1 && ! act[1].startsWith(localPath)) ||
            (ignore.length && micromatch.isMatch(act[1], ignore)))) {
          
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
