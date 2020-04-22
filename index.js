const core = require('@actions/core');
const url = require('url');
const path = require('path');
const micromatch = require('micromatch');
const ftpClient = require('./ftp');
const sftpClient = require('./sftp');
const utils = require('./utils');

(async () => {
  const host = core.getInput('host', { required: true });
  const user = core.getInput('user');
  const password = core.getInput('password');
  const privateKey = core.getInput('private_key');
  const secure = core.getInput('secure');
  const remotePath = utils.trimChar((core.getInput('remotePath') || ''), '/');
  const localPath = utils.trimChar((core.getInput('localPath') || ''), '/');
  const ignore = (core.getInput('ignore') || '').split(',').filter(Boolean);
  const actions = core.getInput('actions', { required: true });
  
  const availableActions = ['download', 'upload', 'move', 'delete'];
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

  if (utils.isJson(actions)) {
    const json = JSON.parse(actions);
    if (json.files && utils.isObject(json.files)) {
      for(file of json.files) {
        if (file.status == 'renamed') {
          parsedActions.push([file.changes ? 'upload' : 'rename', file.previous_filename, path.join(remotePath, file.filename)]);
        }
        else if (file.status == 'added' || file.status == 'modified') {
          parsedActions.push(['upload', file.filename, path.join(remotePath, file.filename)]);
        }
        else if (file.status == 'removed') {
          parsedActions.push(['remove', path.join(remotePath, file.filename)]);
        }
      }
    }
  }
  else {
    parsedActions = actions.split('\n');
  }

  const client = hostURL.protocol === 'ftp:' ? new ftpClient : new sftpClient;
  client.on('connect', info => {
    if (info.status) core.debug('Connected!');
    else core.error('Connecion Failed');
  });
  client.on('download', info => {
    if (info.status) core.debug(`Downloaded: ${info.file}`);
    else if (info.ignored) core.warning(`Download Ignored: ${info.file} ${info.msg ? `(msg: ${info.msg})` : ''}`);
    else core.error(`Download Failed: ${info.file} ${info.msg ? `(msg: ${info.msg})` : ''}`);
  });
  client.on('upload', info => {
    if (info.status) core.debug(`Uploaded: ${info.file}`);
    else if (info.ignored) core.warning(`Upload Ignored: ${info.file} ${info.msg ? `(msg: ${info.msg})` : ''}`);
    else core.error(`Upload Failed: ${info.file} ${info.msg ? `(msg: ${info.msg})` : ''}`);
  });
  client.on('close', info => {
    if (info.status) core.debug('Connection closed');
    else core.error('Close connection Failed');
  });

  client.connect(hostURL.host, hostURL.port, hostURL.username, hostURL.password, hostURL.protocol == 'ftp' ? secure : privateKey);

  for (const act in parsedActions) {
    if (availableActions.indexOf(act[0]) === -1) continue;

    if (act.length > 1) {
      if ((['', './', '.'].indexOf(localPath) === -1 && ! act[1].startsWith(localPath)) ||
          (ignore.length && micromatch.isMatch(act[1], ignore))) {
        
        core.warning(`${utis.capitalize(act[0])} Ignored: ${act[1]}`);
      }
    }

    await client[act[0]].apply(null, act.slice(1));
  }

  await client.close();
})();