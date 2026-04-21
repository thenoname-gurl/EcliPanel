# EcliPanel Mobile

This folder is the mobile app packaging layer for EcliPanel.
It uses Capacitor to wrap `https://ecli.app` in a native shell...

## Setup

```bash
cd app
pnpm install
```

## Android

```bash
pnpm run package:android
```

## iOS

```bash
pnpm run package:ios:unsigned
```

## Notes

- Produced IPA is unsigned!
- The app is configured to load the live site at `https://ecli.app` you can change it in capacitor config!