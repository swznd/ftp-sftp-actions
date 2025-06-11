const sftpClient = require('./sftp');
const url = require('url');

(async () => {
  let client = null;
  let connected = false;
  const host = '';
  const user = '';
  const password = '';
  const privateKey = ``

  const hostURL = url.parse(host);

  if (user) hostURL.username = user;
  if (password) hostURL.password = password;

  client = new sftpClient;
  client.on('connect', info => {
    if (info.status) {
      console.info('Connected!');
      connected = true;
    }
    else {
      console.log('failed', info);
    }
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

  await client.connect(hostURL.hostname, hostURL.port, hostURL.username, hostURL.password, hostURL.protocol == 'ftp:' ? (secure && secure !== 'false' ? true : false) : privateKey);
})();