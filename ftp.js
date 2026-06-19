const EventEmitter = require('events');
const ftpClient = require("promise-ftp");
const path = require('path');
const fs = require('fs');
const micromatch = require('micromatch');
const { Readable } = require('stream');

class Ftp extends EventEmitter {
  constructor() {
    super();
    this.client = new ftpClient;
    this.filter = [];
    this.removeIgnored = false;
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
      this.emit('connect', { status: false, msg: e.message });
    }
  }

  setFilter(filter) {
    this.filter = filter;
  }

  setRemoveIgnored(removeIgnored) {
    this.removeIgnored = removeIgnored;
  }

  async exists(file) {
    return this.isExists(file);
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
      const file = await this.client.get(src);
      await new Promise((resolve, reject) => {
        file.pipe(fs.createWriteStream(dst)).on('close', resolve).on('error', reject);
      });
      this.emit('download', { file: src, status: true });
      return true;
    } catch(e) {
      console.error(e);
      this.emit('download', { file: src, status: false });
      return false;
    }
  }

  async _downloadDir(src, dst, root) {
    if (root === undefined) root = src;

    try {
      if ( ! fs.existsSync(dst)) {
        fs.mkdirSync(dst, { recursive: true, mode: 0o755 });
      }
      else if ( ! fs.statSync(dst).isDirectory()) {
        this.emit('download', { file: src, status: false, msg: 'destination is exist and not a directory' });
      }

      await this._downloadFromDir(src, dst, root);
      return true;
    }
    catch (e) {
      console.error(e);
      this.emit('download', { file: src, status: false });
    }
  }

  async _downloadFromDir(src, dst, root) {
    const lists = await this.client.list(src);
    for(const list of lists) {
      const fullSrc = path.join(src, list.name);
      const relPath = path.relative(root, fullSrc);

      if (this.filter.length && micromatch.isMatch(relPath, this.filter)) {
        this.emit('download', { file: relPath, status: false, ignored: true });
        continue;
      }

      if (list.type == 'd') await this._downloadDir(fullSrc, path.join(dst, list.name), root);
      else {
        await this._downloadFile(fullSrc, path.join(dst, list.name));
      }
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
        return await this._uploadFile(src, dst,);
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

      await this.client.put(Readable.from(content), dst);
      this.emit('write', { file: dst, status: true });
    } catch(e) {
      console.error(e);
      this.emit('write', { file: dst, status: false });
      return false;
    }
  }

  async _uploadFile(src, dst) { 
    const dstPath = path.dirname(dst);
    const dstPathType = await this.isExists(dstPath);

    try {
      if ( ! dstPathType) {
        await this.client.mkdir(dstPath, true);
      }
      
      await this.client.put(src, dst);
      this.emit('upload', { file: dst, status: true });
      return true;
    } catch(e) {
      console.error(e);
      this.emit('upload', { file: dst, status: false });
      return false;
    }
  }

  async _uploadDir(src, dst, root) {
    const isTopLevel = root === undefined;
    if (root === undefined) root = src;

    try {
      const files = fs.readdirSync(src, { withFileTypes: true });
      for (const file of files) {
        const fullPathSrc = path.join(src, file.name);
        const fullPathDst = path.join(dst, file.name);
        const relPath = path.relative(root, fullPathSrc);

        if (this.filter.length && micromatch.isMatch(relPath, this.filter)) {
          this.emit('upload', { file: relPath, status: false, ignored: true });
          continue;
        }

        if (file.isFile()) {
          await this._uploadFile(fullPathSrc, fullPathDst);
        }
        else if (file.isDirectory()) {
          await this._uploadDir(fullPathSrc, fullPathDst, root);
        }
      }

      if (isTopLevel && this.removeIgnored && this.filter.length) {
        await this._removeIgnoredFromRemote(dst, dst);
      }

      return true;
    } catch(e) {
      console.error(e);
      this.emit('upload', { file: dst, status: false });
      return false;
    }
  }

  async _removeIgnoredFromRemote(dst, root) {
    if (root === undefined) root = dst;

    if (await this.isExists(dst) !== 'd') return;

    let lists;
    try {
      lists = await this.client.list(`-a ${dst}`);
    } catch(e) {
      return;
    }

    for (const list of lists) {
      if (list.name === '.' || list.name === '..') continue;

      const fullDst = path.join(dst, list.name);
      const relPath = path.relative(root, fullDst);

      if (micromatch.isMatch(relPath, this.filter)) {
        await this.delete(fullDst);
        continue;
      }

      if (list.type == 'd') {
        await this._removeIgnoredFromRemote(fullDst, root);
      }
    }
  }

  async delete(src) {
    try {
      const checkSrc = await this.isExists(src);

      if (checkSrc == 'd') {
        await this.client.rmdir(src, true);
        this.emit('delete', { file: src, status: true, type: checkSrc });        
      }
      else {
        if (! checkSrc) {
          this.emit('delete', { file: src, status: false, msg: 'source is not exist' });
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
      const checkSrc = await this.isExists(src);

      if ( ! checkSrc) {
        this.emit('move', { file: src, status: false, msg: 'source not exists'});
        return false;
      }

      await this.client.rename(src, dst);
      this.emit('move', { file: src, status: true });
    } catch(e) {
      this.emit('move', { file: dst, status: false });
      return false;
    }
  }

  async clean(dst) {
    try {
      const lists = await this.client.list(`-a ${dst}`);
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

  async isExists(file) {    
    const filePath = path.dirname(file);
    const fileName = path.basename(file);

    try {
      const lists = await this.client.list(`-a ${filePath}`);
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

module.exports = Ftp;
