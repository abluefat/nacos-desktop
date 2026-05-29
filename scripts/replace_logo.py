import sys
sys.path.insert(0, r'C:\Users\13613\.workbuddy\binaries\python\pkgs')

from PIL import Image
import os
import shutil

src_image_path = r'C:\Users\13613\.workbuddy\clipboard-images\clipboard-2026-05-27T00-39-31-291Z-5862a954.jpg'
project_root = r'G:\WorkBuddy\nacos-desktop'

# 打开源图片
img = Image.open(src_image_path)
print(f"原始图片尺寸: {img.size}, 模式: {img.mode}")

# 转换为 RGBA（支持透明度）
img_rgba = img.convert('RGBA')

# 目标 PNG 尺寸列表
sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

# 替换 resources/icons/png/ 下各尺寸
icons_dir = os.path.join(project_root, 'resources', 'icons', 'png')
for size in sizes:
    fname = f'{size}x{size}.png'
    fpath = os.path.join(icons_dir, fname)
    if os.path.exists(fpath):
        resized = img_rgba.resize((size, size), Image.LANCZOS)
        resized.save(fpath, 'PNG')
        print(f'已替换: {fpath}')

# 替换 resources/icon.png (通常 512x512 或 1024x1024)
icon_png_path = os.path.join(project_root, 'resources', 'icon.png')
img_512 = img_rgba.resize((512, 512), Image.LANCZOS)
img_512.save(icon_png_path, 'PNG')
print(f'已替换: {icon_png_path}')

# 生成 resources/icon.ico（Windows 多尺寸 ICO）
ico_path = os.path.join(project_root, 'resources', 'icon.ico')
ico_sizes = [(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)]
ico_images = [img_rgba.resize(s, Image.LANCZOS).convert('RGBA') for s in ico_sizes]
ico_images[0].save(
    ico_path,
    format='ICO',
    sizes=ico_sizes,
    append_images=ico_images[1:]
)
print(f'已替换: {ico_path}')

# 替换 resources/icons/win/icon.ico
win_ico_path = os.path.join(project_root, 'resources', 'icons', 'win', 'icon.ico')
shutil.copy2(ico_path, win_ico_path)
print(f'已替换: {win_ico_path}')

print('\n全部 logo 文件替换完成！')
