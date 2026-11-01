"""Build the PDF demo with the shared Word-style comment surface."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

from build_wordcraft import ROOT, download, run, unpack

SOURCE_URL = 'https://api.github.com/repos/storytold/pdfcraft/tarball/v0.16.1'
SOURCE_SHA256 = '70fcec8f9b09ab251e02aa91f76efa843740801f87396518d324d43f127076bc'


def prepare_fonts(cache):
    spec = json.loads((ROOT / 'pdfcraft-fonts.json').read_text())
    target = cache / 'craft-fonts-pdf'
    for item in spec['files']:
        destination = target / item['path']
        destination.parent.mkdir(parents=True, exist_ok=True)
        download('https://raw.githubusercontent.com/storytold/craft-fonts/' + spec['revision'] + '/' + item['path'], destination, item['sha256'])
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='Existing PdfCraft v0.16.1 source checkout')
    parser.add_argument('--already-patched', action='store_true')
    parser.add_argument('--offline', action='store_true', help='Use dependencies already cached by Cargo')
    parser.add_argument('--cargo', default=shutil.which('cargo') or 'cargo')
    parser.add_argument('--wasm-bindgen', default=shutil.which('wasm-bindgen') or 'wasm-bindgen')
    parser.add_argument('--out', type=Path, default=ROOT / 'site' / 'pdfcraft-classic')
    args = parser.parse_args()
    cache = ROOT / '.cache'
    cache.mkdir(exist_ok=True)
    local_toolchain = cache / 'toolchain' / 'bin'
    if args.cargo == 'cargo' and (local_toolchain / 'cargo').is_file():
        args.cargo = str(local_toolchain / 'cargo')
    local_bindgen = cache / 'wasm-bindgen-0.2.129-aarch64-apple-darwin' / 'wasm-bindgen'
    if args.wasm_bindgen == 'wasm-bindgen' and local_bindgen.is_file():
        args.wasm_bindgen = str(local_bindgen)
    source = (args.source or cache / 'pdfcraft-0.16.1').resolve()
    if not args.source:
        archive = cache / 'pdfcraft-api-source.tar.gz'
        download(SOURCE_URL, archive, SOURCE_SHA256)
        if not (source / 'Cargo.toml').is_file():
            unpack(archive, source)
    patch = ROOT / 'pdfcraft-classic-comments.patch'
    stamp = source / '.rfq-classic-comment-patch'
    digest = hashlib.sha256(patch.read_bytes()).hexdigest()
    # An extracted source under this repo's ignored cache is not its own Git checkout.
    # Stop discovery at its parent so git apply cannot silently skip every patch path.
    patch_env = dict(os.environ, GIT_CEILING_DIRECTORIES=str(source.parent))
    if not args.already_patched:
        applied = subprocess.run(['git', 'apply', '--reverse', '--check', str(patch)], cwd=source, env=patch_env, capture_output=True)
        if applied.returncode != 0:
            run(['git', 'apply', '--check', patch], cwd=source, env=patch_env)
            run(['git', 'apply', patch], cwd=source, env=patch_env)
        stamp.write_text(digest)
    env = dict(os.environ)
    if Path(args.cargo) == local_toolchain / 'cargo':
        env.setdefault('CARGO_HOME', str(cache / 'cargo'))
        env.setdefault('RUSTC', str(local_toolchain / 'rustc'))
        env.setdefault('RUSTDOC', str(local_toolchain / 'rustdoc'))
    target = Path(env.setdefault('CARGO_TARGET_DIR', str(cache / 'target')))
    env.setdefault('CARGO_PROFILE_RELEASE_LTO', 'false')
    env.setdefault('CARGO_PROFILE_RELEASE_OPT_LEVEL', '1')
    env.setdefault('CARGO_PROFILE_RELEASE_CODEGEN_UNITS', '16')
    fonts = Path(env.get('CRAFT_FONTS_DIR') or prepare_fonts(cache))
    env['CRAFT_FONTS_DIR'] = str(fonts.resolve())
    env['CRAFT_FONTS_REQUIRED'] = '1'
    run([args.cargo, 'build', '--locked', *(['--offline'] if args.offline else []),
         '--release', '--target', 'wasm32-unknown-unknown', '-p', 'pdfcraft-web'], cwd=source, env=env)
    args.out.mkdir(parents=True, exist_ok=True)
    run([args.wasm_bindgen, target / 'wasm32-unknown-unknown' / 'release' / 'pdfcraft-web.wasm',
         '--target', 'web', '--no-typescript', '--out-dir', args.out, '--out-name', 'pdfcraft-classic'], env=env)
    html = (source / 'apps/pdfcraft-web/index.html').read_text()
    html = '\n'.join(line for line in html.splitlines() if 'data-trunk' not in line)
    html = html.replace('</head>', '''<link rel="icon" href="data:,">
<script type="module">
import init from './pdfcraft-classic.js';
await init({module_or_path:'./pdfcraft-classic_bg.wasm'});
</script>
</head>''')
    (args.out / 'index.html').write_text(html)
    for name in ('LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE', 'ATTRIBUTION.md'):
        shutil.copy2(source / name, args.out / name)
    for notice in (source / 'assets/fonts').glob('*.txt'):
        shutil.copy2(notice, args.out / notice.name)
    notices = {
        'assets/icons/LICENSE-lucide.txt': 'LICENSE-lucide.txt',
        'vendor/hayro-interpret/assets/LICENSE_FOXIT': 'LICENSE-FOXIT.txt',
        'vendor/hayro-cmap/assets/LICENSE.txt': 'LICENSE-CMAP.txt',
        'vendor/hayro-interpret/assets/CGATS_LICENSE.txt': 'LICENSE-CGATS.txt',
    }
    for path, name in notices.items():
        shutil.copy2(source / path, args.out / name)
    for notice in fonts.glob('fonts/*/OFL.txt'):
        shutil.copy2(notice, args.out / ('OFL-' + notice.parent.name + '.txt'))
    shutil.copy2(fonts / 'ATTRIBUTION.md', args.out / 'ATTRIBUTION-craft-fonts.md')
    print('Built PDF comments:', args.out, flush=True)


if __name__ == '__main__':
    main()
