# SyncTroller

Standalone Linux desktop controller for the Philips Hue Play HDMI Sync Box.
Discovers the Sync Box (and optionally a Hue Bridge) on your LAN and gives
you a tray-resident window for power, HDMI input, sync mode, intensity and
brightness without needing the phone app.

Not affiliated with or endorsed by Signify / Philips Hue.

An Android port lives at
[seanpmackay/SyncTroller-Android](https://github.com/seanpmackay/SyncTroller-Android).

## Install

**Arch / CachyOS (AUR):**

```sh
yay -S synctroller-bin      # or search "synctroller" in Shelly / your AUR helper
```

**Any distro:** grab `SyncTroller-<version>.AppImage` from the
[Releases](https://github.com/seanpmackay/SyncTroller/releases) page,
`chmod +x` it and run.

## Build from source

```sh
npm install
npm start                 # run in dev
npm run dist              # AppImage + tar.gz in dist/
npm run install:desktop   # user-level install straight out of dist/linux-unpacked
```

## License

MIT — see [LICENSE](LICENSE).
