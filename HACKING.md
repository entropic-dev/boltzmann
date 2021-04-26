# Hacking

A quick intro: Boltzmann is a framework implemented as a project template. Its
goal is to provide useful opinions in addition to implementation, while
delivering a first-in-class development experience. To whit this means:

- Common tasks for the developer (testing, writing handlers, implementing
  authentication, etc) should have understandable patterns
- Upgrading the scaffold should be painless for the developer
- The developer should not have to pay for any feature flag they didn't
  opt into; and they may opt into any feature flag at any time.
- The developer should get in-editor documentation and (if enabled) typing.

As you might expect, this shifts a lot of burden _away from_ our audience and
onto us. Thus, we have to be diligent about extending our ability to manage
the surface area of the project through automation and tooling.

---

## How is Boltzmann built?

### Source Code

Boltzmann is built from [Tera] templates contained in the
[`templates`](./templates) dir. The source for the single Boltzmann framework
file is written in typescript contained in the `templates/boltzmann` directory.
It is concatenated together on build using `templates/boltzmann/index.tera`.
When the Boltzmann binary is built, this TypeScript is transpiled using
`bin/buildjs.sh`, which compiles using directives from `tsconfig-build-js.json`.
In particular, it produces ESM equivalents of our TypeScript. We have to be
very careful to avoid cases where TypeScript destroys comment-based template
directives, so where we see this crop up we use the ``void `{% if foo %}`;``
form.

The files in `templates/boltzmann/` include inline `tap` tests. You can run
`npm ci; npm t` to run those tests. This tests the files in-situ. Integration
tests for the compiled scaffold can be run using the `bin/test` tool.

When writing a module in `templates/boltzmann`, keep the following in mind:

- All modules are concatenated inline using `templates/boltzmann/index.tera`.
  This means that names _can collide_. Use unique names and keep all imports
  and exports between `{% if selftest %} {% endif %}` guards.
- All imports for the _final_ concatenated boltzmann file are contained in
  `templates/boltzmann/core/prelude.ts`. All imports in that file _must_ be
  exported in the `selftest` block in order for TypeScript to preserve them.
- Likewise, all exports for the _final_ concatenated boltzmann file are contained
  in `templates/boltzmann/core/exports.ts`. 
- The templates are compiled into ESM JS individually, so errors introduced by
  TypeScript eliding a template directive will only show up when running the
  Boltzmann executable.
- The JavaScript produced by compiling the TypeScript is not tracked in Git.
  It is rebuilt by `cargo build` whenever any files in `templates/` change.
- We avoid class property default initializers for computed values: `class {
  public [Symbol.for('a')]: string = 13 }`. TypeScript assigns intermediate
  variables (`_a`, `_b`, etc) that _will collide_ when the file is concatenated.
- We provide one custom template tag, `tsdoc`, which pulls reference documentation
  from `docs/content/reference/*.md` by section.
- Double check your changes by scaffolding a test project. Check type
  completion in the project and make sure reference docs appear in the editor
  on hover, where appropriate.

See `src/dirspec.ron` for how the scaffolding is laid out.

### Dependencies

Dependencies are controlled by `src/dependencies.ron`.

### Package.json Runscripts

Dependencies are controlled by `src/runscripts.ron`.

## Getting Started

You should have:

- Rust installed (use [rustup])
- node 14+

Check the project out and run `npm ci`.

[Tera]: https://tera.netlify.app/docs/
[rustup]: https://rustup.rs/
