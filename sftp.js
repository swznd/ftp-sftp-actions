const sftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');
const micromatch = require('micromatch');
const fse = require('fs-extra');

class Sftp extends EventEmitter {
  constructor() {
    this.client = new sftpClient;
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
      this.emit('download', { status: true, file: info.source });
    });
  }

  async download(src, dst) {
    try {
      const checkSrc = await this.client.exists(src);

      if ( ! checkSrc) {
        this.emit('download', { file: src, status: false, msg: 'source not exists'});
        return false;
      }

      if (checkSrc == '-') {
        this.emit('download', { file: src, status: false, msg: 'cannot download symlink'});
        return false;
      }

      if (checkSrc == 'd') {
        await this._downloadDir(src, dst);
      }
      else {
        await this._downloadFile(src, dst);
      }
    } catch(e) {
      return false;
    }
  }

  async _downloadFile(src, dst) {
    try {
      await this.client.fastGet(src, dst);
      this.emit('download', { status: true, file: src });
      return true;
    } catch(e) {
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

      await this.client.downloadDir(src, dst);
      return true;
    } catch(e) {
      this.emit('download', { file: src, status: false });
      return false;
    }
  }

  async upload(src, dst, filter) {
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
        return await this._uploadDir(src, dst, filter);
      }
      else if (stat.isFile()) {
        return await this._uploadFile(src, dst);
      }

      return false;
    } catch(e) {
      this.emit('upload', { file: dst, status: false });
      return false;
    }
  }

  async _uploadFile(src, dst) {
    try {
      const dstPath = path.dirname(dst);
      const dstPathType = await this.client.exists(dstPath);
  
      try {
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
        this.emit('upload', { status: false, file: dst });
        return false;
      }    
    } catch(e) {
      this.emit('upload', { file: dst, status: false });
      return false;
    }
  }

  async _uploadDir(src, dst, filter) {
    try {
      if ( ! fs.existsSync(src)) {
        this.emit('upload', { file: dst, status: false, msg: 'source not exist' });
        return false;
      }
      else if ( ! fs.statSync(src).isDirectory()) {
        this.emit('upload', { file: src, status: false, msg: 'source is not a directory' });
      }
  
      let tempSrc = '';
      const ignore = filter ? filter.split(',').filter(Boolean) : [];
  
      if (ignore.length) {
        tempSrc = '__upload-sftp-tmp';
        fse.copySync(path.join(src, file), path.join(src, tempSrc), (src, dst) => micromatch.isMatch(src, ignore));
      }
  
      this.client.uploadDir(path.join(src, tempSrc), dst);
      
      if (tempSrc) {
        fse.removeSync(path.join(src, tempSrc));
      }
    } catch(e) {
      this.emit('upload', { file: dst, status: false });
      return false;
    }
  }

  async delete(src) {
    try {
      const checkSrc = await this.isExists(src);

      if (checkSrc == 'd') {
        await this.client.rmdir(src, true);
        this.emit('remove', { file: src, status: true, type: checkSrc });        
      }
      else {
        if (! checkSrc) {
          this.emit('remove', { file: src, status: true, type: checkSrc });
        }
        else {
          await this.client.delete(src);
          this.emit('remove', { file: src, status: true, type: checkSrc });
        }
      }

      return true;
    } catch(e) {
      this.emit('remove', { file: src, status: false });
      return false;
    }
  }

  async move(src, dst) {
    try {
      const checkSrc = await this.isExists(src);

      if ( ! checkSrc) {
        this.emit('move', { file: src, status: false, msg: 'source not exists'});
        return false;
      }

      await this.rename(src, dst);
    } catch(e) {
      this.emit('move', { file: dst, status: false });
      return false;
    }
  }
}

export default Sftp;