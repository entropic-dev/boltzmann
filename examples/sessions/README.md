# sessions example

This example shows how you might write a simple website using the built-in sessions support.

To scaffold this example, we ran:

```shell
cargo run -- examples/sessions --templates=on --csrf=on --honeycomb=on --redis=on
```

To run this, you need redis running on localhost on its default port. To start the server, run `npm
start`. Then load the [index page](http://localhost:5000/) in your browser. Log in to any user you
like, so long as that user has the password `CATSROOL`. This is an example! What can we say? The
important thing is the code that sets up the middleware.
