"""Build the Word-style comment demo from the pinned WordCraft release and a small patch."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parent
SOURCE_URL = 'https://github.com/storytold/wordcraft/archive/refs/tags/v0.13.2.tar.gz'
SOURCE_SHA256 = 'f5b36f6f57eac8d2f6a2f8fd0be97d8ae46520b3bda796d4ddbfd663140af3f7'
I18N_URL = 'https://github.com/storytold/craft-i18n/archive/9205108cfdced5177706264038848b68b2422d2b.tar.gz'
I18N_SHA256 = 'd080b3ddc63e8d20d78a0c4ba41b975d89490df45431e49ac5b101c869df11b7'


def run(args, **kwargs):
    print('+', ' '.join(str(arg) for arg in args), flush=True)
    subprocess.run([str(arg) for arg in args], check=True, **kwargs)


def download(url, archive, checksum):
    if not archive.exists():
        temporary = archive.with_suffix(archive.suffix + '.part')
        with urllib.request.urlopen(url, timeout=90) as response, temporary.open('wb') as output:
            shutil.copyfileobj(response, output)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != checksum:
            raise ValueError('Source checksum mismatch: ' + url)
        temporary.replace(archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != checksum:
        raise ValueError('Source checksum mismatch: ' + url)


def unpack(archive, target):
    target.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive) as package:
        for member in package.getmembers():
            relative = Path(*Path(member.name).parts[1:])
            if relative.is_absolute() or '..' in relative.parts:
                raise ValueError('Unexpected archive path')
            if member.isdir():
                (target / relative).mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                destination = target / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                with package.extractfile(member) as source, destination.open('wb') as output:
                    shutil.copyfileobj(source, output)
            else:
                raise ValueError('Unexpected archive link or special file')


def prepare_fonts(cache):
    spec = json.loads((ROOT / 'wordcraft-fonts.json').read_text())
    target = cache / 'craft-fonts-word'
    for item in spec['files']:
        # Keep the verified upstream manifest intact; the local build manifest
        # lists only font files included in this pinned, bounded input set.
        local = 'fonts/manifest.upstream.txt' if item['path'] == 'fonts/manifest.txt' else item['path']
        destination = target / local
        destination.parent.mkdir(parents=True, exist_ok=True)
        download('https://raw.githubusercontent.com/storytold/craft-fonts/' + spec['revision'] + '/' + item['path'], destination, item['sha256'])
    selected = {item['path'] for item in spec['files'] if item['path'].endswith(('.ttf', '.otf'))}
    entries = []
    for line in (target / 'fonts/manifest.upstream.txt').read_text().splitlines():
        fields = line.split(' | ')
        if len(fields) >= 4 and fields[2] in selected:
            entries.append(line)
    if len(entries) != len(selected):
        raise ValueError('Word font manifest does not match the verified font inputs')
    (target / 'fonts/manifest.txt').write_text('\n'.join(entries) + '\n')
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='Existing WordCraft v0.13.2 source checkout')
    parser.add_argument('--already-patched', action='store_true', help='The supplied checkout already contains this patch')
    parser.add_argument('--cargo', default=shutil.which('cargo') or 'cargo')
    parser.add_argument('--wasm-bindgen', default=shutil.which('wasm-bindgen') or 'wasm-bindgen')
    parser.add_argument('--out', type=Path, default=ROOT / 'site' / 'wordcraft-classic')
    args = parser.parse_args()
    cache = ROOT / '.cache'
    cache.mkdir(exist_ok=True)
    local_toolchain = cache / 'toolchain' / 'bin'
    if args.cargo == 'cargo' and (local_toolchain / 'cargo').is_file():
        args.cargo = str(local_toolchain / 'cargo')
    local_bindgen = cache / 'wasm-bindgen-0.2.129-aarch64-apple-darwin' / 'wasm-bindgen'
    if args.wasm_bindgen == 'wasm-bindgen' and local_bindgen.is_file():
        args.wasm_bindgen = str(local_bindgen)
    source = (args.source or cache / 'wordcraft-0.13.2').resolve()
    if not args.source:
        archive = cache / 'wordcraft-0.13.2.tar.gz'
        download(SOURCE_URL, archive, SOURCE_SHA256)
        if not (source / 'Cargo.toml').exists():
            unpack(archive, source)
    patch = ROOT / 'wordcraft-classic-comments.patch'
    stamp = source / '.rfq-classic-comment-patch'
    digest = hashlib.sha256(patch.read_bytes()).hexdigest()
    # A source archive in an ignored directory must not inherit the outer repo's Git prefix.
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
    if not env.get('CRAFT_I18N_DIR'):
        archive = cache / 'craft-i18n.tar.gz'
        download(I18N_URL, archive, I18N_SHA256)
        translations = cache / 'craft-i18n'
        if not (translations / 'locales').is_dir():
            unpack(archive, translations)
        env['CRAFT_I18N_DIR'] = str(translations.resolve())
    fonts = Path(env.get('CRAFT_FONTS_DIR') or prepare_fonts(cache))
    env['CRAFT_FONTS_DIR'] = str(fonts.resolve())
    env['CRAFT_FONTS_REQUIRED'] = '1'
    target = Path(env.setdefault('CARGO_TARGET_DIR', str(cache / 'target')))
    # Keep this local preview quick to rebuild. These options do not change document features.
    env.setdefault('CARGO_PROFILE_RELEASE_LTO', 'false')
    env.setdefault('CARGO_PROFILE_RELEASE_OPT_LEVEL', '1')
    run([args.cargo, 'build', '--locked', '--release', '--target', 'wasm32-unknown-unknown', '-p', 'wordcraft-web'], cwd=source, env=env)
    args.out.mkdir(parents=True, exist_ok=True)
    run([args.wasm_bindgen, target / 'wasm32-unknown-unknown' / 'release' / 'wordcraft-web.wasm', '--target', 'web', '--no-typescript', '--out-dir', args.out, '--out-name', 'wordcraft-classic'], env=env)
    html = (source / 'apps/wordcraft-web/index.html').read_text()
    html = '\n'.join(line for line in html.splitlines() if 'data-trunk' not in line)
    html = html.replace('</head>', '''<link rel="icon" href="data:,">
<script type="module">
try {
  const {default:init}=await import('./wordcraft-classic.js');
  await init({module_or_path:'./wordcraft-classic_bg.wasm'});
} catch(cause) {
  const error=cause instanceof Error?cause.message:String(cause);
  const loading=document.getElementById('wordcraft_loading');
  if(loading)loading.textContent='Word 编辑器启动失败：'+error;
  if(window.parent!==window&&new URLSearchParams(window.location.search).get('host')==='parent')
    window.parent.postMessage({type:'wordcraft:failed',error},window.location.origin);
}
</script>
</head>''')
    (args.out / 'index.html').write_text(html)
    for name in ('LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE'):
        shutil.copy2(source / name, args.out / name)
    for notice in fonts.glob('fonts/*/OFL.txt'):
        shutil.copy2(notice, args.out / ('OFL-' + notice.parent.name + '.txt'))
    shutil.copy2(fonts / 'ATTRIBUTION.md', args.out / 'ATTRIBUTION-craft-fonts.md')
    names = sorted(str(path.relative_to(args.out)) for path in args.out.rglob('*') if path.is_file() and path.name != 'build.json')
    (args.out / 'build.json').write_text(json.dumps({'editor':'wordcraft','version':'0.13.2','patchSha256':digest,
        'files':{name:hashlib.sha256((args.out / name).read_bytes()).hexdigest() for name in names}}, indent=2))
    print('Built Word-style comments:', args.out, flush=True)


if __name__ == '__main__':
    main()
