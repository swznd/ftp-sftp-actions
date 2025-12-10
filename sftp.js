const EventEmitter = require('events');
const sftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');
const micromatch = require('micromatch');
const fse = require('fs-extra');
const { Readable } = require('stream');
const { Client } = require('ssh2');

class Sftp extends EventEmitter {
  constructor() {
    super()
    this.client = new sftpClient;
    this.sshClient = null;
    this.filter = [];
  }

  setFilter(filter) {
    this.filter = filter;
  }

  async connect(host, port, user, password, privateKey, debug) {
    try {
      this.config = {
        host: host,
        username: user,
        password: password,
        port: port || 22,
        privateKey: privateKey
      }

      if (debug) {
        this.config.debug = msg => {
          console.error(msg);
        };
      }
      
      await this.client.connect(this.config);
      this.emit('connect', { status: true });
    } catch (e) {
      this.emit('connect', { status: false, msg: e.message });
    }

    this.client.on('upload', info => {
      this.emit('upload', { status: true, file: info.destination });
    });

    this.client.on('download', info => {
      this.emit('download', { status: true, file: info.destination });
    });
  }

  async close() {
    try {
      await this.client.end();
      if (this.sshClient) {
        this.sshClient.end();
      }
      this.emit('close', { status: true });
    } catch(e) {
      this.emit('close', { status: false });
    }
  }

  async download(src, dst) {
    try {
      const checkSrc = await this.client.exists(src);

      if ( ! checkSrc) {
        this.emit('download', { file: src, status: false, msg: 'source is not exist'});
        return false;
      }

      if (checkSrc == 'd') {
        return await this._downloadDir(src, dst);
      }
      
      return await this._downloadFile(src, dst);
    } catch(e) {
      console.error(e);
      this.emit('download', { file: src, status: false });
      return false;
    }
  }

  async _downloadFile(src, dst) {
    try {
      const file = fs.createWriteStream(dst);
      await this.client.get(src, file);
      this.emit('download', { status: true, file: src });
      return true;
    } catch(e) {
      console.error(e);
      this.emit('download', { status: false, file: src });
      return false;
    }
  }

  async _downloadDir(src, dst) {
    try {
      if ( ! fs.existsSync(dst)) {
        fs.mkdirSync(dst, { recursive: true, mode: 0o755 });
      }
      else if ( ! fs.statSync(dst).isDirectory()) {
        this.emit('download', { file: src, status: false, msg: 'destination is exist and not a directory' });
      }

      let tempSrc = '';

      if (this.filter.length) {
        tempSrc = '.tmp-sftp';
      }

      await this.client.downloadDir(src, path.join(dst, tempSrc));

      if (tempSrc) {
        fse.copySync(path.join(dst, tempSrc), dst, (src, dst) => {
          if (micromatch.isMatch(src, this.filter)) {
            this.emit('download', { file: src, status: false, ignored: true });
            return false;
          }

          return true;
        });
        fse.removeSync(path.join(dst, tempSrc));
      }

      return true;
    } catch(e) {
      console.error(e);
      this.emit('download', { file: src, status: false });
      return false;
    }
  }

  async upload(src, dst) {
    try {
      if ( ! fs.existsSync(src)) {
        this.emit('upload', { file: dst, status: false, msg: 'source not exist' });
        return false;
      }
      
      let stat = fs.statSync(src);
  
      if (stat.isSymbolicLink()) {
        src = fs.realpathSync(src);
        stat = fs.statSync(src);
      }
  
      if (stat.isDirectory()) {
        return await this._uploadDir(src, dst);
      }
      else if (stat.isFile()) {
        return await this._uploadFile(src, dst);
      }

      return false;
    } catch(e) {
      console.error(e);
      this.emit('upload', { file: dst, status: false });
      return false;
    }
  }

  async write(content, dst) {
    try {
      if (typeof content !== 'string') {
        this.emit('write', { file: dst, status: false, msg: 'content is not string' });
        return false;
      }

      await this.client.put(Readable.from(content), dst, { mode: 0o644 });
      this.emit('write', { file: dst, status: true });
    } catch(e) {
      console.error(e);
      this.emit('write', { file: dst, status: false });
      return false;
    }
  }

  async _uploadFile(src, dst) {
    try {
      const dstPath = path.dirname(dst);
      const dstPathType = await this.client.exists(dstPath);
  
      if ( ! dstPathType) {
        await this.client.mkdir(dstPath, true);
      }
      
      await this.client.fastPut(src, dst)
      this.emit('upload', { status: true, file: dst });
      return true;
    } catch(e) {
      console.error(e);
      this.emit('upload', { file: dst, status: false });
      return false;
    }
  }

  async _uploadDir(src, dst) {
    try {
      if ( ! fs.existsSync(src)) {
        this.emit('upload', { file: dst, status: false, msg: 'source not exist' });
        return false;
      }
      else if ( ! fs.statSync(src).isDirectory()) {
        this.emit('upload', { file: src, status: false, msg: 'source is not a directory' });
      }
  
      let tempSrc = '';
  
      if (this.filter.length) {
        tempSrc = path.join('..', '.tmp-sftp');
        fse.copySync(src, path.join(src, tempSrc), (src, dst) => {
          if (micromatch.isMatch(src, this.filter)) {
            this.emit('upload', { file: src, status: false, ignored: true });
            return false;
          }

          return true;
        });
      }
  
      await this.client.uploadDir(path.join(src, tempSrc), dst);
      
      if (tempSrc) {
        fse.removeSync(path.join(src, tempSrc));
      }
    } catch(e) {
      console.error(e);
      this.emit('upload', { file: dst, status: false });
      return false;
    }
  }

  async delete(src) {
    try {
      const checkSrc = await this.client.exists(src);

      if (checkSrc == 'd') {
        await this.client.rmdir(src, true);
        this.emit('delete', { file: src, status: true, type: checkSrc });        
      }
      else {
        if (! checkSrc) {
          this.emit('delete', { file: src, status: false, msg: 'source is not exists' });
        }
        else {
          await this.client.delete(src);
          this.emit('delete', { file: src, status: true, type: checkSrc });
        }
      }

      return true;
    } catch(e) {
      console.error(e);
      this.emit('delete', { file: src, status: false });
      return false;
    }
  }

  async clean(dst) {
    try {
      const lists = await this.client.list(dst);
      for(let list of lists) {
        if (list.type == 'd') {
          await this.client.rmdir(path.join(dst, list.name), true);
        }
        else {
          await this.client.delete(path.join(dst, list.name));
        }

        this.emit('delete', { file: list.name, status: true, type: list.type });
      }
    } catch(e) {
      console.error(e);
      this.emit('clean', { file: dst, status: false });
      return false;      
    }
  }

  async move(src, dst) {
    try {
      const checkSrc = await this.client.exists(src);

      if ( ! checkSrc) {
        this.emit('move', { file: src, status: false, msg: 'source not exists'});
        return false;
      }

      await this.client.rename(src, dst);
      this.emit('move', { file: src, status: true });
    } catch(e) {
      console.error(e);
      this.emit('move', { file: dst, status: false });
      return false;
    }
  }

  exec(command) {
    return new Promise((resolve, reject) => {
      try {
        this.sshClient = new Client();

        this.sshClient.on('ready', () => {
          this.sshClient.exec(command, (err, stream) => {
            if (err) {
              this.emit('exec', { status: false, command, msg: err.message });
              return;
            }

            let stdout = '';
            let stderr = '';

            stream.on('close', (code, signal) => {
              const status = code === 0;
              this.emit('exec', { status, command, code, signal, stdout, stderr });
              resolve();
            });

            stream.on('data', (data) => {
              stdout += data.toString();
            });

            stream.stderr.on('data', (data) => {
              stderr += data.toString();
            });
          });
        }).connect(this.config);
      } catch (e) {
        console.error(e);
        this.emit('exec', { status: false, command, msg: e.message });
        resolve();
      }
    });
  }
}

module.exports = Sftp;
