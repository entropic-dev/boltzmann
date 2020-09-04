{% if esm %}
import "./boltzmann.js"
{% else %}
require('./boltzmann')
{% endif %}
