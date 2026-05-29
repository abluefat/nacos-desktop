import sys
sys.path.insert(0, r'C:\Users\13613\.workbuddy\binaries\python\pkgs')

from PIL import Image
import os

src = r'C:\Users\13613\.workbuddy\clipboard-images\clipboard-2026-05-27T00-39-31-291Z-5862a954.jpg'
project_root = r'G:\WorkBuddy\nacos-desktop'

img = Image.open(src).convert('RGBA')

# 生成符合 electron-builder 要求的 ICO（至少 256x256，推荐包含 256）
ico_path = os.path.join(project_root, 'resources', 'icon.ico')
# electron-builder 要求 ICO 最小 256x256
ico_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
ico_images = [img.resize(s, Image.LANCZOS).convert('RGBA') for s in ico_sizes]
ico_images[0].save(
    ico_path,
    format='ICO',
    sizes=ico_sizes,
    append_images=ico_images[1:]
)
print(f'ICO 已重新生成: {ico_path}')

# 同步更新 win/icon.ico
import shutil
win_ico = os.path.join(project_root, 'resources', 'icons', 'win', 'icon.ico')
shutil.copy2(ico_path, win_ico)
print(f'win ICO 已更新: {win_ico}')

# 验证 ICO 尺寸
verify = Image.open(ico_path)
print(f'ICO 尺寸: {verify.size}')
