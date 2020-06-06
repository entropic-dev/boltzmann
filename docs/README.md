# Boltzmann: an introduction

We do not yet have documentation or marketing for this project. This readme contains our notes for how we intend to proceed.

Our audience:

- our colleagues who need to use Boltzmann and want guidance
- our colleagues who are actively using Boltzmann but want detailed information on a specific topic
- node programmers curious about a new framework they might want to use

Things we need overall:

- concepts: an intro, glossary; here's [an example from Django](https://docs.djangoproject.com/en/3.0/topics/db/models/)
  - request lifecycle
  - routing
  - middleware & decorators
  - error handling
  - responding to requests
  - configuration
- Reference docs; rust doc is the gold standard
  - all exports: context struct, all provided middleware
  - our implicit traits: handlers & middleware
  - middleware setup
  - decorator setup
  - validation
  - what's provided for tests (e.g., transactions)
- tutorials
  - getting started with boltzmann
  - accepting data from the user
  - how to turn features on and off
  - how to update
  - how to test
  - how to version an endpoint
  - preparing your service for production
  - examples might become tutorials
