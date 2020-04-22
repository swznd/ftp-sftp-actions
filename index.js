const core = require('@actions/core');
const url = require('url');
const ftpClient = require('./ftp');
const sftpClient = require('./sftp');

(async () => {
  const host = core.getInput('host', { required: true });
  const user = core.getInput('user');
  const password = core.getInput('password');
  const privateKey = core.getInput('private_key');
  const secure = core.getInput('secure');
  const actions = core.getInput('actions', { required: true }).split('\n');
  
  const availableCommands = ['download', 'upload', 'move', 'delete'];
  
  const hostURL = url.parse(host);

  if (user) hostURL.username = user;
  if (password) hostURL.password = password;

  if (hostURL.username == '') {
    core.setFailed('User is required');
  }

  if (hostURL.pass == '') {
    core.setFailed('Password is required');
  }

  if (['ftp', 'sftp'].indexOf(hostURL.protocol) === -1) {
    core.setFailed(`${hostURL.protocol} is not supported`);
  }

  const client = hostURL.protocol === 'ftp' ? new ftpClient : new sftpClient;
  client.on('connect', info => {
    if (info.status) core.debug('Connected!');
    else core.warning('Connecion Failed');
  });
  client.on('download', info => {
    if (info.status) core.debug(`Downloaded: ${info.file}`);
    core.error(`Download Failed: ${info.file} ${info.msg ? `(msg: ${info.msg})` : ''}`);
  });
  client.on('upload', info => {
    if (info.status) core.debug(`Uploaded: ${info.file}`);
    core.error(`Upload Failed: ${info.file} ${info.msg ? `(msg: ${info.msg})` : ''}`);
  });
  client.on('close', info => {
    if (info.status) core.debug('Connection closed');
    else core.warning('Close connection Failed');
  });

  client.connect(hostURL.host, hostURL.port, hostURL.username, hostURL.password, hostURL.protocol == 'ftp' ? secure : privateKey);

  for (const action in actions) {
    const cmdArgs = action.split(' ');
    if (availableCommands.indexOf(cmdArgs[0]) === -1) continue;
    await client[actions[cmdArgs[0]]].apply(null, cmdArgs.slice(1));
  }

  await client.close();
})();