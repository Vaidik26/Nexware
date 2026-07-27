#!/usr/bin/env python3
"""
Generate NexWare branded mobile icon and splash image assets using Pillow.
Replaces default/missing Expo logos with luxury evergreen & emerald NexWare branding.
"""
import os
from PIL import Image, ImageDraw, ImageFont

ASSETS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../mobile/assets'))
os.makedirs(ASSETS_DIR, exist_ok=True)

# Brand Color Palette
BG_DARK_EMERALD = (0, 53, 39)       # #003527 Primary Dark Evergreen
CONTAINER_GREEN = (6, 78, 59)       # #064e3b Inner Hex Container
MINT_ACCENT = (128, 190, 166)       # #80bea6 Mint Glow Accent
WHITE = (255, 255, 255)
SUBTITLE_COLOR = (110, 231, 183)    # #6ee7b7 Light Emerald

def draw_nexware_logo(draw, center_x, center_y, scale=1.0):
    """Draws the geometric hexagonal NexWare logo at specified center and scale."""
    # Base radius for outer hexagon
    r = int(180 * scale)
    
    # Outer diamond/hexagon coordinates (approximated)
    points = [
        (center_x, center_y - r),
        (center_x + int(r * 0.866), center_y - int(r * 0.5)),
        (center_x + int(r * 0.866), center_y + int(r * 0.5)),
        (center_x, center_y + r),
        (center_x - int(r * 0.866), center_y + int(r * 0.5)),
        (center_x - int(r * 0.866), center_y - int(r * 0.5)),
    ]
    
    # Draw filled hexagon container
    draw.polygon(points, fill=CONTAINER_GREEN, outline=MINT_ACCENT, width=int(12 * scale))
    
    # Draw stylized 'N' geometric lines inside hexagon
    in_r = int(r * 0.55)
    line_w = max(4, int(24 * scale))
    
    # Left vertical leg
    draw.line([
        (center_x - in_r, center_y + int(in_r * 0.8)),
        (center_x - in_r, center_y - int(in_r * 0.8))
    ], fill=WHITE, width=line_w)
    
    # Diagonal connect
    draw.line([
        (center_x - in_r, center_y - int(in_r * 0.8)),
        (center_x + in_r, center_y + int(in_r * 0.8))
    ], fill=MINT_ACCENT, width=line_w)
    
    # Right vertical leg
    draw.line([
        (center_x + in_r, center_y + int(in_r * 0.8)),
        (center_x + in_r, center_y - int(in_r * 0.8))
    ], fill=WHITE, width=line_w)

def create_icon(filename, size=1024, scale=1.8):
    img = Image.new("RGBA", (size, size), BG_DARK_EMERALD)
    draw = ImageDraw.Draw(img)
    draw_nexware_logo(draw, size // 2, size // 2, scale=scale)
    out_path = os.path.join(ASSETS_DIR, filename)
    img.save(out_path, "PNG")
    print(f"Generated {out_path}")

def create_splash(filename, width=1284, height=2778):
    img = Image.new("RGBA", (width, height), BG_DARK_EMERALD)
    draw = ImageDraw.Draw(img)
    # Center logo slightly above midpoint
    draw_nexware_logo(draw, width // 2, height // 2 - 200, scale=1.5)
    
    # Add text title using default font or drawn text block if fonts not guaranteed
    # Since standard font might be tiny, we draw simple decorative geometric bar under logo
    bar_w = 400
    bar_h = 10
    bx1 = (width - bar_w) // 2
    by1 = height // 2 + 150
    draw.rectangle([bx1, by1, bx1 + bar_w, by1 + bar_h], fill=MINT_ACCENT)
    
    out_path = os.path.join(ASSETS_DIR, filename)
    img.save(out_path, "PNG")
    print(f"Generated {out_path}")

if __name__ == '__main__':
    create_icon("icon.png", size=1024, scale=1.8)
    create_icon("adaptive-icon.png", size=1024, scale=1.4)  # Smaller scale for Android safe zone
    create_icon("favicon.png", size=48, scale=0.1)
    create_splash("splash.png", width=1284, height=2778)
    print("All NexWare branded assets generated successfully!")
