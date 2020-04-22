const EventEmitter = require('events');
const sftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');
const micromatch = require('micromatch');
const fse = require('fs-extra');

class Sftp extends EventEmitter {
  constructor() {
    super()
    this.client = new sftpClient;
    this.filter = [];
  }

  setFilter(filter) {
    this.filter = filter;
  }

  async connect(host, port, user, password, privateKey) {
    try {
      await this.client.connect({
        host: host,
        username: user,
        password: password,
        port: port || 22,
        privateKey: privateKey
      });
      this.emit('connect', { status: true });
    } catch (e) {
      this.emit('connect', { status: false });
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

  async _uploadFile(src, dst) {
    try {
      const dstPath = path.dirname(dst);
      const dstPathType = await this.client.exists(dstPath);
  
      if (dstPathType != 'd') {
        if (dstPathType) {
          await this.client.delete(dstPathType);
        }
  
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
        tempSrc = '.tmp-sftp';
        fse.copySync(path.join(src, file), path.join(src, tempSrc), (src, dst) => {
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
}

module.exports = Sftp;