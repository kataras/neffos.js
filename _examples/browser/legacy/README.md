# Legacy browsers support

You need to use the `neffos.legacy.min.js` instead of the `neffos.js` and register the `polyfill.min.js` script first (or  check the [../](../README.md)).

Read more at: <https://babeljs.io/docs/en/babel-polyfill>.


1. Make sure that you have [golang](https://golang.org/dl) installed to run and edit the neffos (server-side).
```sh
$ cd ../ && go run server.go # start the neffos server.
```
2. Navigate to <http://localhost:8080/legacy/client.html>.