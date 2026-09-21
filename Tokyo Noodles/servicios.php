<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Servicios | Tokyo Noodles</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="css/style.css">
</head>
<body>

    <!-- NAVBAR -->
    <nav class="navbar navbar-expand-sm navbar-dark">
        <div class="container-fluid px-4">
            <a class="navbar-brand" href="index.php">TOKYO NOODLES</a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#collapsibleNavbar">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="collapsibleNavbar">
                <ul class="navbar-nav me-auto">
                    <li class="nav-item dropdown">
                        <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">Categorías</a>
                        <ul class="dropdown-menu">
                            <li><a class="dropdown-item" href="productos.php?categoria=Ramen">Ramen</a></li>
                            <li><a class="dropdown-item" href="productos.php?categoria=Gyozas">Gyozas</a></li>
                            <li><a class="dropdown-item" href="productos.php?categoria=Combos">Combos</a></li>
                        </ul>
                    </li>
                    <li class="nav-item"><a class="nav-link" href="empresa.php">Nosotros</a></li>
                    <li class="nav-item"><a class="nav-link" href="productos.php">Menú</a></li>
                    <li class="nav-item"><a class="nav-link" href="servicios.php">Servicios</a></li>
                    <li class="nav-item"><a class="nav-link" href="contacto.php">Contacto</a></li>
                </ul>
                <form class="d-flex me-3" action="productos.php" method="GET">
                    <input class="form-control" name="q" placeholder="Buscar productos">
                </form>
                <button type="button" class="btn btn-tokyo" data-bs-toggle="modal" data-bs-target="#myModal">Acceder</button>
            </div>
        </div>
    </nav>

    <!-- MAIN CONTENT -->
    <main>
        <!-- PAGE HEADER -->
        <section class="page-header">
            <div class="container">
                <p class="mb-1">MÁS QUE UN RESTAURANTE</p>
                <h1 class="fw-bold">Servicios</h1>
            </div>
        </section>

        <!-- SERVICES CARDS -->
        <section class="py-5">
            <div class="container">
                <div class="row g-4">
                    <div class="col-md-4">
                        <div class="product-card p-4">
                            <h3>🍜 En restaurante</h3>
                            <p>Disfruta nuestro menú en un ambiente inspirado en la simpleza y calidez de Tokyo.</p>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="product-card p-4">
                            <h3>🥡 Take away</h3>
                            <p>Pide tus favoritos para llevar y disfrutar donde quieras.</p>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="product-card p-4">
                            <h3>🎉 Eventos</h3>
                            <p>Opciones de catering y formatos para celebraciones pequeñas y reuniones.</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    </main>

    <!-- FOOTER -->
    <footer class="footer py-5 mt-5">
        <div class="container">
            <div class="row g-4">
                <div class="col-md-4">
                    <h5 class="fw-bold">TOKYO NOODLES</h5>
                    <p>Ramen, gyozas y sabor japonés hecho para compartir.</p>
                </div>
                <div class="col-md-4">
                    <h6>Explora</h6>
                    <p class="mb-1"><a href="productos.php">Menú</a></p>
                    <p class="mb-1"><a href="empresa.php">Nosotros</a></p>
                    <p><a href="contacto.php">Contacto</a></p>
                </div>
                <div class="col-md-4">
                    <h6>Horario</h6>
                    <p class="mb-1">Lun–Jue: 12:00–22:00</p>
                    <p>Vie–Dom: 12:00–23:00</p>
                </div>
            </div>
            <hr>
            <div class="text-center">© 2026 Tokyo Noodles. Todos los derechos reservados.</div>
        </div>
    </footer>

    <!-- MODAL DE ACCESO -->
    <div class="modal fade" id="myModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h4 class="modal-title">Acceder</h4>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <form action="empresa.php">
                        <div class="mb-3">
                            <label for="loginEmail" class="form-label">Email:</label>
                            <input type="email" class="form-control" id="loginEmail" name="email">
                        </div>
                        <div class="mb-3">
                            <label for="pwd" class="form-label">Contraseña:</label>
                            <input type="password" class="form-control" id="pwd" name="pswd">
                        </div>
                        <button type="submit" class="btn btn-tokyo">Ingresar</button>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <!-- SCRIPTS -->
    <script src="js/router.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>