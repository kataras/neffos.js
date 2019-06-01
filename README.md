<img src="gh_logo_js.png" />

`neffos.js` is the client-side javascript library for the [neffos](https://github.com/kataras/neffos) real-time framework.

It can run through any modern [browser](_examples/browser), [browserify](_examples/browserify) and [nodejs](_examples/nodejs).

[![Node version](https://img.shields.io/npm/v/neffos.js.svg?style=for-the-badge)](https://www.npmjs.com/package/neffos.js) [![JavaScript Style Guide: Good Parts](https://img.shields.io/badge/code%20style-goodparts-brightgreen.svg?style=for-the-badge)](https://github.com/dwyl/goodparts) [![Known Vulnerabilities](https://img.shields.io/badge/vulnerabilities%20-0-228B22.svg?style=for-the-badge)](https://snyk.io/test/github/kataras/neffos.js?targetFile=package.json) [![chat](https://img.shields.io/gitter/room/neffos-framework/community.svg?color=blue&logo=gitter&style=for-the-badge)](https://gitter.im/neffos-framework/community) [![backend pkg](https://img.shields.io/badge/server%20-package-488AC7.svg?style=for-the-badge)](https://github.com/kataras/neffos)

## Installation

### node.js

```sh
$ npm install neffos.js [--save --save-prefix=~]
```

```js
const neffos = require('neffos.js');
```

**Note** that this library's versioning scheme is not semver-compatible for historical reasons. For guaranteed backward compatibility, always depend on ~X.X.X instead of ^X.X.X (hence the --save-prefix above).

### Browsers

Development:

```html
<script src="//cdn.jsdelivr.net/npm/neffos.js@X.X.X/dist/neffos.js"></script>
```

Production:

```html
<script src="//cdn.jsdelivr.net/npm/neffos.js@X.X.X/dist/neffos.min.js"></script>
```

**Remember** to replace the version tag with the exact release your project depends upon.

The library supports CommonJS loader and also exports globally as `neffos`.

See [./_examples](_examples) for basic usage, and [kataras/neffos/_examples](https://github.com/kataras/neffos/tree/master/_examples) for extensive use.

## Install definition file

`neffos.js` definition file for javascript developers is part of the [DefinitelyTyped](https://www.npmjs.com/package/@types/neffos.js). 

```sh
$ npm i @types/neffos.js
```
