import os
import re
import urllib.request
import json
import time

TARGET_DIR = os.path.join(os.path.dirname(__file__), "test_images_30")
os.makedirs(TARGET_DIR, exist_ok=True)

DISPLAY_SPECS = [
    {"id": 1, "mfg": "Apple", "model": "iPhone 8", "tech": "LCD", "url": "https://www.ifixit.com/products/iphone-8-screen"},
    {"id": 2, "mfg": "Apple", "model": "iPhone 8 Plus", "tech": "LCD", "url": "https://www.ifixit.com/products/iphone-8-plus-screen"},
    {"id": 3, "mfg": "Apple", "model": "iPhone X", "tech": "Soft OLED", "url": "https://www.ifixit.com/products/iphone-x-screen"},
    {"id": 4, "mfg": "Apple", "model": "iPhone XR", "tech": "In-cell LCD", "url": "https://www.ifixit.com/products/iphone-xr-screen"},
    {"id": 5, "mfg": "Apple", "model": "iPhone XS", "tech": "Soft OLED", "url": "https://www.ifixit.com/products/iphone-xs-screen"},
    {"id": 6, "mfg": "Apple", "model": "iPhone XS Max", "tech": "Soft OLED", "url": "https://www.ifixit.com/products/iphone-xs-max-screen"},
    {"id": 7, "mfg": "Apple", "model": "iPhone 11", "tech": "In-cell LCD", "url": "https://www.ifixit.com/products/iphone-11-screen"},
    {"id": 8, "mfg": "Apple", "model": "iPhone 11 Pro", "tech": "Soft OLED", "url": "https://www.ifixit.com/products/iphone-11-pro-screen"},
    {"id": 9, "mfg": "Apple", "model": "iPhone 11 Pro Max", "tech": "Soft OLED", "url": "https://www.ifixit.com/products/iphone-11-pro-max-screen"},
    {"id": 10, "mfg": "Apple", "model": "iPhone 12 / 12 Pro", "tech": "Soft OLED", "url": "https://www.ifixit.com/products/iphone-12-12-pro-screen"},
    {"id": 11, "mfg": "Apple", "model": "iPhone 12 Mini", "tech": "Soft OLED", "url": "https://www.ifixit.com/products/iphone-12-mini-screen"},
    {"id": 12, "mfg": "Apple", "model": "iPhone 12 Pro Max", "tech": "Soft OLED", "url": "https://www.ifixit.com/products/iphone-12-pro-max-screen"},
    {"id": 13, "mfg": "Apple", "model": "iPhone 13", "tech": "OLED", "url": "https://www.ifixit.com/products/iphone-13-screen"},
    {"id": 14, "mfg": "Apple", "model": "iPhone 13 Mini", "tech": "OLED", "url": "https://www.ifixit.com/products/iphone-13-mini-screen"},
    {"id": 15, "mfg": "Apple", "model": "iPhone 13 Pro", "tech": "COF LCD / OLED", "url": "https://www.ifixit.com/products/iphone-13-pro-screen"},
    {"id": 16, "mfg": "Apple", "model": "iPhone 13 Pro Max", "tech": "COF LCD / OLED", "url": "https://www.ifixit.com/products/iphone-13-pro-max-screen"},
    {"id": 17, "mfg": "Apple", "model": "iPhone 14", "tech": "OLED", "url": "https://www.ifixit.com/products/iphone-14-screen"},
    {"id": 18, "mfg": "Apple", "model": "iPhone 14 Plus", "tech": "OLED", "url": "https://www.ifixit.com/products/iphone-14-plus-screen"},
    {"id": 19, "mfg": "Apple", "model": "iPhone 14 Pro", "tech": "Dynamic Island OLED", "url": "https://www.ifixit.com/products/iphone-14-pro-screen"},
    {"id": 20, "mfg": "Apple", "model": "iPhone 14 Pro Max", "tech": "Dynamic Island OLED", "url": "https://www.ifixit.com/products/iphone-14-pro-max-screen"},
    {"id": 21, "mfg": "Apple", "model": "iPhone 15", "tech": "Dynamic Island OLED", "url": "https://www.ifixit.com/products/iphone-15-screen"},
    {"id": 22, "mfg": "Apple", "model": "iPhone 15 Plus", "tech": "Dynamic Island OLED", "url": "https://www.ifixit.com/products/iphone-15-plus-screen"},
    {"id": 23, "mfg": "Apple", "model": "iPhone 15 Pro", "tech": "Dynamic Island OLED", "url": "https://www.ifixit.com/products/iphone-15-pro-screen"},
    {"id": 24, "mfg": "Apple", "model": "iPhone 15 Pro Max", "tech": "Dynamic Island OLED", "url": "https://www.ifixit.com/products/iphone-15-pro-max-screen"},
    {"id": 25, "mfg": "Apple", "model": "iPad Pro 12.9", "tech": "FOG LCD", "url": "https://www.ifixit.com/products/ipad-pro-12-9-2018-2020-gen-screen"},
    {"id": 26, "mfg": "Apple", "model": "iPad Pro 11", "tech": "FOG LCD", "url": "https://www.ifixit.com/products/ipad-pro-11-screen"},
    {"id": 27, "mfg": "Samsung", "model": "Galaxy S21 Ultra", "tech": "Dynamic AMOLED", "url": "https://www.ifixit.com/products/galaxy-s21-ultra-screen"},
    {"id": 28, "mfg": "Samsung", "model": "Galaxy S22 Ultra", "tech": "Dynamic AMOLED", "url": "https://www.ifixit.com/products/galaxy-s22-ultra-screen"},
    {"id": 29, "mfg": "Samsung", "model": "Galaxy S23 Ultra", "tech": "Dynamic AMOLED", "url": "https://www.ifixit.com/products/galaxy-s23-ultra-screen"},
    {"id": 30, "mfg": "Google", "model": "Pixel 7 Pro", "tech": "LTPO OLED", "url": "https://www.ifixit.com/products/google-pixel-7-pro-screen-genuine"},
]

headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
}

manifest = []

for spec in DISPLAY_SPECS:
    print(f"[{spec['id']:02d}/30] Fetching page for {spec['mfg']} {spec['model']}...")
    req = urllib.request.Request(spec["url"], headers=headers)
    img_urls = []
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
            # find all cdn.shopify.com image URLs
            found = list(dict.fromkeys(re.findall(r"https://cdn\.shopify\.com/s/files/[^\"'\'' ]+\.jpg", html)))
            # exclude icons or irrelevant small assets
            img_urls = [u for u in found if "apple-touch" not in u and "favicon" not in u]
    except Exception as e:
        print(f"   ⚠️ Error fetching {spec['url']}: {e}")

    # Fallback to secondary image search if needed
    chosen_url = None
    if img_urls:
        # Prefer the 2nd image if available as it often shows the rear/flex cables of the screen
        chosen_url = img_urls[1] if len(img_urls) > 1 else img_urls[0]
    
    if not chosen_url:
        print(f"   ⚠️ No image found for {spec['model']}, skipping...")
        continue

    filename = f"{spec['id']:02d}_{spec['mfg']}_{spec['model'].replace('/', '_').replace(' ', '_')}.jpg"
    target_path = os.path.join(TARGET_DIR, filename)

    try:
        print(f"   ⬇️ Downloading image from {chosen_url}...")
        img_req = urllib.request.Request(chosen_url, headers=headers)
        with urllib.request.urlopen(img_req, timeout=20) as img_resp:
            data = img_resp.read()
            with open(target_path, "wb") as f_out:
                f_out.write(data)
        file_size = os.path.getsize(target_path)
        print(f"   ✅ Saved {filename} ({file_size // 1024} KB)")
        manifest.append({
            "id": spec["id"],
            "filename": filename,
            "path": target_path,
            "expectedManufacturer": spec["mfg"],
            "expectedModel": spec["model"],
            "expectedTech": spec["tech"],
            "sourceUrl": spec["url"],
            "imageUrl": chosen_url
        })
    except Exception as e:
        print(f"   ❌ Failed to download image: {e}")

    time.sleep(0.5)

manifest_path = os.path.join(TARGET_DIR, "manifest.json")
with open(manifest_path, "w") as f_m:
    json.dump(manifest, f_m, indent=2)

print(f"\n🎉 Successfully downloaded {len(manifest)}/30 real display images! Manifest saved to {manifest_path}")
