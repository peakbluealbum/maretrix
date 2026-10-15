# Privacy Policy

**Effective date:** 2026-10-15

Maretrix is a private, self-hosted fork of the Sable Matrix client. It is operated for a
single household (family and friends), not as a public service. It is not distributed on
any app store as a public product.

## Who is responsible

The operator of this instance is the household running the `app.daiwascarlet.com`
deployment. There is no company and no separate data controller. Contact the operator
directly if you have questions.

## What we collect

**Nothing.** This fork ships with no crash reporting, no analytics, no telemetry, and no
third-party tracking.

- The upstream Sable client integrates Sentry for optional crash reporting. That
  integration is still present in the code but is **inactive**: no Sentry DSN is
  configured in this build (`VITE_SENTRY_DSN` is unset), so no diagnostic data is ever
  transmitted. The "Diagnostics & Privacy" settings page therefore has nothing to send.
- We run no server-side logging of message content. The homeserver operator (also the
  household) sees only what any Matrix homeserver necessarily sees to deliver messages.

## What stays on your device and your homeserver

Maretrix talks directly to the Matrix homeserver you choose (`daiwascarlet.com` by
default). Your messages, room names, display names, avatars, contacts, authentication
tokens, encryption keys, and media are exchanged between your device and that homeserver.
They are not routed through, or stored by, any third party operated by this project.

End-to-end encrypted rooms are encrypted on your device; the homeserver cannot read their
contents.

## Third-party services

None. There is no Sentry, no analytics provider, and no crash-reporting endpoint. If a
future build ever enables crash reporting, this document will be updated first and a
notice shown in-app before anything is sent.

## Your controls

Because nothing is collected, there is nothing to opt out of. If a build ever has crash
reporting configured, the controls would live in **Settings → General → Diagnostics &
Privacy**, and would default to off.

## Children

This instance is intended for the operator's household and invited guests only. It is not
directed to the general public or to children.

## Changes to this policy

Changes are tracked in this repository's history. Because this is a private instance, the
authoritative version is whatever is deployed at `app.daiwascarlet.com`.

## Contact

Contact the household operator directly (the person who invited you to this instance).
