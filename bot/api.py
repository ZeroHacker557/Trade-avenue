"""
HTTP API — Mini App dan mahsulotlar va buyurtmalarni olish/yuborish uchun.
"""
import os
import json
from aiohttp import web
from config import API_HOST, API_PORT, IMAGES_DIR
import firebase_db as db


async def handle_get_products(request):
    products = db.get_products()
    return web.json_response(products)


async def handle_get_categories(request):
    categories = db.get_categories()
    return web.json_response(categories)


async def handle_get_product(request):
    prod_id = int(request.match_info["id"])
    product = db.get_product_by_id(prod_id)
    if product:
        return web.json_response(product)
    return web.json_response({"error": "Not found"}, status=404)


async def handle_post_order(request):
    """Mini App'dan buyurtma qabul qilish"""
    try:
        data = await request.json()
        # Store order reference for the bot to process
        request.app["pending_orders"].append(data)
        # Notify the bot about the new order
        if request.app.get("order_callback"):
            await request.app["order_callback"](data)
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)


async def handle_get_image(request):
    """Rasm fayllarini qaytarish"""
    filename = request.match_info["filename"]
    filepath = os.path.join(IMAGES_DIR, filename)
    if os.path.exists(filepath):
        return web.FileResponse(filepath)
    return web.json_response({"error": "Image not found"}, status=404)


def create_app(order_callback=None):
    app = web.Application()
    app["pending_orders"] = []
    app["order_callback"] = order_callback

    # CORS middleware
    @web.middleware
    async def cors_middleware(request, handler):
        if request.method == "OPTIONS":
            response = web.Response()
        else:
            response = await handler(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return response

    app.middlewares.append(cors_middleware)

    app.router.add_get("/api/products", handle_get_products)
    app.router.add_get("/api/categories", handle_get_categories)
    app.router.add_get("/api/products/{id}", handle_get_product)
    app.router.add_post("/api/orders", handle_post_order)
    app.router.add_get("/images/{filename}", handle_get_image)

    # Serve OPTIONS for CORS preflight
    app.router.add_route("OPTIONS", "/api/{tail:.*}", lambda r: web.Response())

    return app


async def start_api(order_callback=None):
    app = create_app(order_callback)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, API_HOST, API_PORT)
    await site.start()
    print(f"[API] Server started: http://{API_HOST}:{API_PORT}")
    return runner
