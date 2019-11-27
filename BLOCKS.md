// {% block requirements %}

## `requirements` block

- AST Position: `Block`, toplevel

Purpose: pull in additional dependencies via `const ___ = require(___)`.

* * *

## `context_constructor` block

- AST Position: `FunctionBody`, inside `Context` class constructor

Purpose: add additional instance & setup attributes to the `Context` object.

* * *

## `context_body` block

- AST Position: `ClassBody`, inside `Context` class body

Purpose: add additional methods, class instance attributes, getters and setters to the `Context` object.

* * *

## `default_reachability_checks` block

- AST Position: `ObjectBody`, inside default param for `monitoringMiddleware`

Purpose: wire up functions defined in `reachability_functions` block.

* * *

## `reachability_functions` block

- AST Position: `Block`, toplevel

// <% block reachability_functions %>
// <% block suite_setup %>
// <% block suite_teardown %>
// <% block test_setup %>
  // <% block test_teardown %>
// {% block runtime_middleware %}
// <% block self_test %>
