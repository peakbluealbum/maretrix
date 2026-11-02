# Publishing Maretrix to the AUR

The recipe is `packaging/arch/PKGBUILD` + `packaging/arch/.SRCINFO` in this repo. The AUR
entry is a thin git repo containing exactly those two files.

## 0. Prerequisite: the release tag must exist

`PKGBUILD` sources `https://github.com/peakbluealbum/maretrix/archive/refs/tags/$_gh_tag.tar.gz`,
where `_gh_tag='v1.1.0-rc2'`. If that tag is not on GitHub, `makepkg` fails at download and
the AUR package is dead on arrival.

```bash
git tag -l 'v1.1.0*'          # expect v1.1.0-rc1 — rc2 is NOT tagged yet
```

Tagging is also what triggers the release workflow, which is what builds the `.deb`, `.rpm`
and the Arch `.pkg.tar.zst` that this recipe mirrors. So the order is:

1. merge the work to `main`,
2. `git tag -a v1.1.0-rc2 -m "Maretrix 1.1.0-rc2" && git push origin v1.1.0-rc2`,
3. let the release workflow finish,
4. then publish to the AUR.

## 1. One-time: AUR account + key

1. Create an account at <https://aur.archlinux.org/register/>.
2. Add an SSH public key under *My Account → SSH Public Key*:
   ```bash
   ssh-keygen -t ed25519 -C "aur@$(hostname)" -f ~/.ssh/aur
   cat ~/.ssh/aur.pub
   ```
3. Point git at that key for the AUR host (`~/.ssh/config`):
   ```
   Host aur.archlinux.org
     User aur
     IdentityFile ~/.ssh/aur
   ```

## 2. First push

```bash
git clone ssh://aur@aur.archlinux.org/maretrix.git
cd maretrix
cp /path/to/maretrix/packaging/arch/PKGBUILD .
cp /path/to/maretrix/packaging/arch/.SRCINFO .
git add PKGBUILD .SRCINFO
git commit -m "Initial import: maretrix 1.1.0rc2"
git push
```

The AUR rejects a push that contains anything other than `PKGBUILD`, `.SRCINFO` and
`.gitignore` — do not copy the whole `packaging/arch` directory.

## 3. Publishing a new version

```bash
cd /path/to/maretrix
# edit pkgver _and_ _gh_tag together (PKGBUILD drops the dash, the tag keeps it)
$EDITOR packaging/arch/PKGBUILD
cd packaging/arch
makepkg --printsrcinfo > .SRCINFO     # must be regenerated on an Arch box
```

Then copy both files into the AUR clone, commit and push,
`git commit -m "upgpkg: maretrix 1.1.0rc3"`.

## 4. Keep it honest

`makepkg -si` in `packaging/arch` is the same path CI runs in its `linux-arch` job. If that
job is green, the AUR package builds. Test the recipe locally before pushing — an AUR
package that fails to build is worse than no package.

## Note on `-bin`

A prebuilt `maretrix-bin` package (repackaging the CI `.pkg.tar.zst`) would install faster,
but for a Matrix client the source package is the better default: it links the user's own
WebKitGTK, which is the entire reason this recipe exists.
