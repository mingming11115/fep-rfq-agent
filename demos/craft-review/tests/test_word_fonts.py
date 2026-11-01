"""Exercise the native font build script under the browser target, without a browser."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class WordBrowserFonts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        script = ROOT / '.cache/wordcraft-0.13.2/crates/fonts/build.rs'
        rustc = ROOT / '.cache/toolchain/bin/rustc'
        if not script.is_file():
            raise unittest.SkipTest('Prepare the pinned WordCraft source with craft:build first')
        cls.temporary = tempfile.TemporaryDirectory(prefix='rfq-word-font-tests-')
        cls.directory = Path(cls.temporary.name)
        cls.program = cls.directory / 'font-build'
        subprocess.run([str(rustc) if rustc.is_file() else shutil.which('rustc'),
                        '--edition=2024', str(script), '-o', str(cls.program)], check=True)

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def generate(self, families):
        with tempfile.TemporaryDirectory(dir=self.directory) as temporary:
            root = Path(temporary)
            (root / 'fonts').mkdir()
            lines = []
            for family, script in families:
                path = 'fonts/' + script + '.ttf'
                (root / path).write_bytes(b'font input; build script only selects files')
                lines.append(f'{family} | Regular | {path} | {script} | OFL-1.1')
            (root / 'fonts/manifest.txt').write_text('\n'.join(lines))
            env = dict(os.environ, CARGO_CFG_TARGET_ARCH='wasm32', CRAFT_FONTS_DIR=str(root),
                       CRAFT_FONTS_REQUIRED='1', OUT_DIR=str(root))
            result = subprocess.run([str(self.program)], env=env, check=True, capture_output=True, text=True)
            return result.stdout, (root / 'craft_fonts.rs').read_text()

    def test_browser_build_keeps_chinese_and_japanese_fallbacks(self):
        output, fonts = self.generate([('Noto Sans CJK SC', 'Hans'), ('BIZ UDPGothic', 'Jpan')])
        self.assertNotIn('cargo::error', output)
        self.assertIn('family: "Noto Sans CJK SC"', fonts)
        self.assertIn('family: "BIZ UDPGothic"', fonts)

    def test_required_browser_build_reports_a_missing_chinese_font(self):
        output, _ = self.generate([('BIZ UDPGothic', 'Jpan')])
        self.assertIn('no Hans font', output)


if __name__ == '__main__':
    unittest.main()
