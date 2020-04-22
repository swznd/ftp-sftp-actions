const ftpClient = require("promise-ftp");
const path = require('path');
const fs = require('fs');

class Ftp extends EventEmitter {
  constructor() {
    this.client = new ftpClient;
  }

  async connect(host, port, user, password, secure) {
    try {
      await this.client.connect({
        host: host,
        port: port || 21,
        user: user,
        password: password,
        secure: secure
      });
      this.emit('connect', { status: true });
    } catch(e) {
      this.emit('connect', { status: false });
    }
  }

  setFilter(filter) {
    this.filter = filter;
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
      const checkSrc = await this.isExists(src);

      if ( ! checkSrc) {
        this.emit('download', { file: src, status: false, msg: 'source not exists'});
        return false;
      }

      if (checkSrc == '-') {
        this.emit('download', { file: src, status: false, msg: 'cannot download symlink'});
        return false;
      }
      
      if (checkSrc == 'd') {
        return await this._downloadDir(src, dst);
      }
      else if (checkSrc == 'f') {
        return await this._download(src, dst);
      }

      return false;
    } catch(e) {
      this.emit('download', { file: src, status: false });
      return false;      
    }
  }

  async _downloadFile(src, dst) {
    try {
      const file = await this.client.get(src);
      await new Promise((resolve, reject) => {
        file.createReadStream().pipe(
          fs.createWriteStream(dst)
        )
        .on('close', resolve)
        .on('error', reject);
      });
      this.emit('download', { file: src, status: true });
      return true;
    } catch(e) {
      this.emit('download', { file: src, status: false });
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

      await this._downloadFromDir(src, dst);
      return true;
    }
    catch {
      this.emit('download', { file: src, status: false });
    }
  }

  async _downloadFromDir(src, dst) {
    const lists = await this.client.list(src);

    for(const list of lists) {
      if (this.filter.length && micromatch.isMatch(list.name, this.filter)) {
        this.emit('download', { file: list.name, status: false, ignored: true });
        continue;
      }

      if (list.type == 'd') await this._downloadFromDir(path.join(src, list.name), dst);
      else {
        await this._downloadFile(src, dst);
      }
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
        return await this._uploadDir(src, dst);
      }
      else if (stat.isFile()) {
        return await this._uploadFile(src, dst,);
      }

      return false;
    } catch(e) {
      this.emit('upload', { file: dst, status: false });
      return false;
    }
  }

  async _uploadFile(src, dst) { 
    const dstPath = path.dirname(dst);
    const dstPathType = await this.isExists(dstPath);

    try {
      if (dstPathType != 'd') {
        if (dstPathType) {
          await this.client.delete(dstPathType);
        }
  
        await this.client.mkdir(dstPath, true);
      }
      
      await this.client.put(src, dst);
      this.emit('upload', { file: dst, status: true });
      return true;
    } catch(e) {
      this.emit('upload', { file: dst, status: false });
      return false;
    }
  }

  async _uploadDir(src, dst) {
    try {  
      const files = fs.readdirSync(src, { withFileTypes: true });
  
      for (const file of files) {
        if (this.filter.length && micromatch.isMatch(file.name, this.filter)) {
          this.emit('upload', { file: file.name, status: false, ignored: true });
          continue;
        }
  
        const fullPath = path.join(src, file.name);
        if (file.isFile()) {
          try {
            await this.client.put(fullPath, path.join(dst, file.name));
            this.emit('upload', { file: dst, status: true });
          } catch(e) {
            await this.client.put(fullPath, path.join(dst, file.name));
            this.emit('upload', { file: dst, status: false });
            return false;
          }
        }
        else if (file.isDirectory()) {
          await this.client.mkdir(path.join(dst, file.name), true);
        }
      }

      return true;
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

  async isExists(file) {    
    const filePath = path.dirname(file);
    const fileName = path.basename(file);

    try {
      const lists = await this.client.list(filePath);
      for(let list of lists) {
        if (list.name == fileName) {
          return list.type;
        }
      }
  
      return false; 
    } catch(e) {
      return false;
    }
  }
}

export default Ftp;
