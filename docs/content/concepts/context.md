+++
title="Context"
weight=1
+++

## Introduction

When Boltzmann receives an HTTP request, it wraps the incoming [Http Request]
in a [`Context`] object. This object is open for extension by your application:
feel free to add properties to it in your handlers and middleware.
