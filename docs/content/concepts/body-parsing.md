+++
title="Body Parsing"
weight=10
+++

## Introduction

Boltzmann makes request bodies available to your application
via [`context.body`] in the form of a JavaScript object. This
document describes how Boltzmann takes the stream of bytes sent
by a client and turns them into that JavaScript object.
