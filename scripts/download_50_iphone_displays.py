import os
import re
import json
import urllib.request

MODELS_CONFIG = [
    # Legacy / Home button models
    {"slug": "iphone-6-screen", "model": "iPhone 6", "views": ["rear", "front"]},
    {"slug": "iphone-6s-screen", "model": "iPhone 6s", "views": ["rear", "front"]},
    {"slug": "iphone-7-screen", "model": "iPhone 7", "views": ["rear", "front"]},
    {"slug": "iphone-7-plus-screen", "model": "iPhone 7 Plus", "views": ["rear", "front"]},
    {"slug": "iphone-8-screen", "model": "iPhone 8", "views": ["rear", "front"]},
    {"slug": "iphone-8-plus-screen", "model": "iPhone 8 Plus", "views": ["rear", "front"]},
    {"slug": "iphone-se-2020-screen", "model": "iPhone SE (2nd Gen)", "views": ["rear", "front"]},
    
    # X / XS / XR Generation (High difficulty lookalikes)
    {"slug": "iphone-x-screen", "model": "iPhone X", "views": ["rear", "front"]},
    {"slug": "iphone-xr-screen", "model": "iPhone XR", "views": ["rear", "front"]},
    {"slug": "iphone-xs-screen", "model": "iPhone XS", "views": ["rear", "front"]},
    {"slug": "iphone-xs-max-screen", "model": "iPhone XS Max", "views": ["rear", "front"]},
    
    # 11 Series
    {"slug": "iphone-11-screen", "model": "iPhone 11", "views": ["rear", "front"]},
    {"slug": "iphone-11-pro-screen", "model": "iPhone 11 Pro", "views": ["rear", "front"]},
    {"slug": "iphone-11-pro-max-screen", "model": "iPhone 11 Pro Max", "views": ["rear", "front"]},
    
    # 12 Series (Flat edges, earpiece in screen)
    {"slug": "iphone-12-12-pro-screen", "model": "iPhone 12 / 12 Pro", "views": ["rear", "front"]},
    {"slug": "iphone-12-mini-screen", "model": "iPhone 12 mini", "views": ["rear", "front"]},
    {"slug": "iphone-12-pro-max-screen", "model": "iPhone 12 Pro Max", "views": ["rear", "front"]},
    
    # 13 Series (Narrow notch, earpiece in chassis frame)
    {"slug": "iphone-13-screen", "model": "iPhone 13", "views": ["rear", "front"]},
    {"slug": "iphone-13-mini-screen", "model": "iPhone 13 mini", "views": ["rear", "front"]},
    {"slug": "iphone-13-pro-screen", "model": "iPhone 13 Pro", "views": ["rear", "front"]},
    {"slug": "iphone-13-pro-max-screen", "model": "iPhone 13 Pro Max", "views": ["rear", "front"]},
    
    # 14 Series (Notch on Base/Plus vs Dynamic Island on Pro/Pro Max)
    {"slug": "iphone-14-screen", "model": "iPhone 14", "views": ["rear", "front"]},
    {"slug": "iphone-14-plus-screen", "model": "iPhone 14 Plus", "views": ["rear", "front"]},
    {"slug": "iphone-14-pro-screen", "model": "iPhone 14 Pro", "views": ["rear", "front"]},
    {"slug": "iphone-14-pro-max-screen", "model": "iPhone 14 Pro Max", "views": ["rear", "front"]},
    
    # 15 Series (Dynamic Island on all models)
    {"slug": "iphone-15-screen", "model": "iPhone 15", "views": ["rear", "front"]},
    {"slug": "iphone-15-plus-screen", "model": "iPhone 15 Plus", "views": ["rear", "front"]},
    {"slug": "iphone-15-pro-screen", "model": "iPhone 15 Pro", "views": ["rear", "front"]},
    {"slug": "iphone-15-pro-max-screen", "model": "iPhone 15 Pro Max", "views": ["rear", "front"]},
]

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_images_50")
os.makedirs(OUTPUT_DIR, exist_ok=True)

headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

manifest = []
item_idx = 1

for cfg in MODELS_CONFIG:
    if item_idx > 50:
        break
    slug = cfg["slug"]
    expected_model = cfg["model"]
    url = f"https://www.ifixit.com/products/{slug}"
    print(f"Fetching {slug}...")
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode("utf-8", errors="ignore")
            # find all shopify image URLs
            raw_imgs = re.findall(r"https://cdn\.shopify\.com/s/files/[^\"'\'' ]+\.jpg", html)
            imgs = []
            for img in raw_imgs:
                if "apple-touch" not in img and "favicon" not in img and "logo" not in img and img not in imgs:
                    imgs.append(img)
            
            if not imgs:
                print(f"  No images found for {slug}")
                continue
            
            # We want up to 2 distinct images (e.g. rear and front)
            # Typically iFixit product pages have:
            # img[0] = main photo (usually front or rear 3/4)
            # img[1] or img[2] = opposite view (rear or front)
            selected_urls = []
            if len(imgs) == 1:
                selected_urls.append((imgs[0], cfg["views"][0]))
            elif len(imgs) >= 2:
                # If there are 3+ images, often img 0 and img 1 or 2 are opposite sides
                selected_urls.append((imgs[0], cfg["views"][0]))
                if item_idx < 50:
                    selected_urls.append((imgs[1] if len(imgs) == 2 else imgs[2], cfg["views"][1]))
            
            for img_url, view in selected_urls:
                if item_idx > 50:
                    break
                safe_slug = slug.replace("-screen", "").replace("-", "_")
                filename = f"{item_idx:02d}_{safe_slug}_{view}.jpg"
                filepath = os.path.join(OUTPUT_DIR, filename)
                
                print(f"  Downloading #{item_idx}: {filename} ({view})...")
                img_req = urllib.request.Request(img_url, headers=headers)
                with urllib.request.urlopen(img_req, timeout=15) as ir:
                    img_data = ir.read()
                    with open(filepath, "wb") as f:
                        f.write(img_data)
                
                manifest.append({
                    "index": item_idx,
                    "filename": filename,
                    "expected_manufacturer": "Apple",
                    "expected_model": expected_model,
                    "view": view,
                    "slug": slug,
                    "source_url": img_url,
                    "file_size": len(img_data),
                })
                item_idx += 1

    except Exception as e:
        print(f"  Error processing {slug}: {e}")

manifest_path = os.path.join(OUTPUT_DIR, "manifest.json")
with open(manifest_path, "w") as f:
    json.dump(manifest, f, indent=2)

print(f"\nSuccessfully downloaded {len(manifest)} iPhone display images to {OUTPUT_DIR}")
print(f"Manifest saved to {manifest_path}")
