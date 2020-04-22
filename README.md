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

## Action Example
