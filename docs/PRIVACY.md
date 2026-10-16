# Privacy Policy

**Last updated:** 2026-10-15

Maretrix is a private, self-hosted fork of the [Sable](https://github.com/Sable-RTC/sable)
Matrix client. This instance serves a small, closed group of invited users. It is not a
public service and is not published to any app store.

## Who is responsible

The operator of the `app.daiwascarlet.com` deployment. There is no company and no separate
data controller; contact the operator directly with any questions.

## What we collect

**Nothing.** This build ships with no active analytics, no crash reporting, and no
third-party tracking.

The upstream Sable client includes an optional Sentry integration for error reporting. That
code is still present, but it is **inactive in this build**: no `VITE_SENTRY_DSN` is
configured, so the integration never initializes and no diagnostic data leaves your device.
The toggles under **Settings → General → Diagnostics & Privacy** are therefore inert — there
is no endpoint to send to — and they default to off.

No message content is logged server-side. The homeserver operator sees only what any Matrix
homeserver necessarily sees in order to deliver messages.

## What stays on your device and your homeserver

Maretrix connects directly to the Matrix homeserver you choose (`daiwascarlet.com` by
default). Your messages, room names, display names, avatars, contacts, access tokens,
encryption keys, and media are exchanged only between your device and that homeserver. None
of it is routed through, or stored by, any third party operated by this project. Rooms that
are end-to-end encrypted are encrypted on your device; the homeserver cannot read their
contents.

## Third-party services

None. No analytics provider and no crash-reporting endpoint receive any data from this
build. If a future build ever enables crash reporting, this document will be updated first
and an in-app notice shown before anything is transmitted.

## Your controls

Because nothing is collected, there is nothing to opt out of. If a future build enables
crash reporting, its controls will live under **Settings → General → Diagnostics & Privacy**
and will default to off.

## Children

This instance is for invited members only. It is not directed to the general public or to
children.

## Changes to this policy

Changes are tracked in this repository's history. The authoritative version is whatever is
deployed at `app.daiwascarlet.com`.

## Contact

Contact the instance operator directly — the person who invited you.
