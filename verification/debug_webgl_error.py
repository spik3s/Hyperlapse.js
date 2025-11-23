import time
from playwright.sync_api import sync_playwright

def debug_webgl_error():
    with sync_playwright() as p:
        # We need a way to mock success if the API key is invalid, or just check if we can trigger the error
        # even if data is partial.
        # But Hyperlapse won't generate points if it fails.
        # So we can't reproduce the texture switch if we don't get past loading.

        # However, the user is seeing the error, so they probably have a valid key or mock.
        # The key in .env is dummy.

        # I can try to mock the StreetViewService response?
        # But I need to modify the loaded JS or network intercept.

        # Let's assume the user has a key and focus on the code fix.
        # The error "glCopySubTextureCHROMIUM: Offset overflows texture dimensions"
        # strongly suggests a mismatch between the texture allocated on GPU and the data we are trying to upload.

        # Since I can't reproduce without a valid key (as the app won't reach the generation phase),
        # I will apply the logical fix which is to ensure the material is updated.

        pass

if __name__ == "__main__":
    debug_webgl_error()
