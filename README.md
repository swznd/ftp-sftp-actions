# Simple FTP/SFTP Deploy

Simple FTP / SFTP Deploy with automatically detect directory or file when upload and download

## Inputs

### `host`

**Required** Hostname or ip address with url format, ex: `ftp://ftp.example.com` or `sftp://user:pa55w0rd@server1.example.com:2222`

### `port`

Port number sftp server, it will overwrite `host` input if provided. Default `22`

### `user`

**Required** Username to login ftp/sftp server, it will overwrite `host` input if provided.

### `password`

Password to login ftp/sftp server, it will overwrite `host` input if provided.

### `secure`

Secure connection options for ftp connection. Default `true`

### `privateKey`

SSH private key to login sftp server, if you want to connect without password, you can save your private key in your repo settings -> secrets

### `ignore`

Ignore file/folders by glob matching (comma separated). Matched files are skipped during upload/download. Default `.github/**,.gitignore,**/.gitignore`

### `removeIgnoredFiles`

When `true`, after a directory upload the remote tree is scanned and any file/folder matching the `ignore` patterns is deleted from the remote — even if it no longer exists locally. Useful for cleaning up files that were deployed before being added to `ignore`. Default `false`

## Action Example
