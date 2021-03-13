+++
title="Body Parsers"
weight=4
slug="body-parsers"
[taxonomies]
tags = ["reference"]
+++

This document describes Boltzmann's request body parsing functionality. Boltzmann
provides built-in parsing for JSON and urlencoded request bodies out of the box.

If you need to handle other content types (for example, `text/plain` or
`multipart/form-data`), you will want to write and install a custom body
parser.

## Builtin Body Parsers

### `json`

{{ changelog(version = "0.0.0") }}

The `json` body parser parses [json](https://mdn.io/json) request bodies, identified
by the `Content-Type` request header. Any request with a `Content-Type` which does not
satisfy `application/json` will be skipped.

Examples of content types which will be parsed:

- `application/json; charset=UTF-8`
- `application/json`
- `application/vnd.NPM.corgi+json`

### `urlEncoded`

{{ changelog(version = "0.0.0") }}

The `urlEncoded` body parser parses [urlencoded](https://mdn.io/urlencoded) request bodies,
identified by the `Content-Type` request header. Any request with a `Content-Type` which does
not satisfy `application/x-www-form-urlencoded` will be skipped.

Examples of content types which will be parsed:

- `application/x-www-form-urlencoded`

## Custom Body Parsers

{{ changelog(version = "0.0.0") }}

- when would you use it
- what is the type signature, what are you expected to return
- example code (multipart example because...!)
