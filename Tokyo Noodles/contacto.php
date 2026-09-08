<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contacto | Tokyo Noodles</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<nav class="navbar navbar-expand-sm navbar-dark">
<div class="container-fluid px-4">
<a class="navbar-brand" href="index.php">TOKYO NOODLES</a>
<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#collapsibleNavbar"><span class="navbar-toggler-icon"></span></button>
<div class="collapse navbar-collapse" id="collapsibleNavbar">
<ul class="navbar-nav me-auto">
<li class="nav-item dropdown"><a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">Categorías</a>
<ul class="dropdown-menu">
<li><a class="dropdown-item" href="productos.php">Ramen</a></li>
<li><a class="dropdown-item" href="productos.php">Gyozas</a></li>
<li><a class="dropdown-item" href="productos.php">Combos</a></li>
</ul></li>
<li class="nav-item"><a class="nav-link" href="empresa.php">Nosotros</a></li>
<li class="nav-item"><a class="nav-link" href="productos.php">Menú</a></li>
<li class="nav-item"><a class="nav-link" href="servicios.php">Servicios</a></li>
<li class="nav-item"><a class="nav-link" href="contacto.php">Contacto</a></li>
</ul>
<form class="d-flex me-3" action="productos.php"><input class="form-control" name="q" placeholder="Buscar productos"></form>
<button type="button" class="btn btn-tokyo" data-bs-toggle="modal" data-bs-target="#myModal">Acceder</button>
</div></div></nav>
<main><section class="page-header"><div class="container"><p class="mb-1">ESTAMOS PARA AYUDARTE</p><h1 class="fw-bold">Contacto</h1></div></section>
<section class="py-5"><div class="container"><div class="row g-5">
<div class="col-lg-5"><div class="contact-card p-4"><h2>Visítanos</h2><p>📍 Av. Tokyo 2026, Santiago</p><p>☎ +56 9 2026 2026</p><p>✉ hola@tokyonoodles.cl</p><hr><p class="mb-0">Lun–Jue 12:00–22:00<br>Vie–Dom 12:00–23:00</p></div></div>
<div class="col-lg-7"><h2 class="section-title">Escríbenos</h2><form id="formContacto">
<div class="mb-3"><label for="nombre" class="form-label">Nombre</label><input id="nombre" class="form-control" type="text"></div>
<div class="mb-3"><label for="email" class="form-label">Email</label><input id="email" class="form-control" type="email"></div>
<div class="mb-3"><label for="mensaje" class="form-label">Mensaje</label><textarea id="mensaje" class="form-control" rows="5"></textarea></div>
<button class="btn btn-tokyo" type="submit">Enviar mensaje</button><div id="alertaContacto"></div>
</form></div></div></div></section></main>
<script src="js/app.js"></script>
<footer class="footer py-5 mt-5">
<div class="container"><div class="row g-4">
<div class="col-md-4"><h5 class="fw-bold">TOKYO NOODLES</h5><p>Ramen, gyozas y sabor japonés hecho para compartir.</p></div>
<div class="col-md-4"><h6>Explora</h6><p class="mb-1"><a href="productos.php">Menú</a></p><p class="mb-1"><a href="empresa.php">Nosotros</a></p><p><a href="contacto.php">Contacto</a></p></div>
<div class="col-md-4"><h6>Horario</h6><p class="mb-1">Lun–Jue: 12:00–22:00</p><p>Vie–Dom: 12:00–23:00</p></div>
</div><hr><div class="text-center">© 2026 Tokyo Noodles. Todos los derechos reservados.</div></div>
</footer>
<div class="modal fade" id="myModal" tabindex="-1">
<div class="modal-dialog"><div class="modal-content">
<div class="modal-header"><h4 class="modal-title">Acceder</h4><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
<div class="modal-body"><form action="empresa.php">
<div class="mb-3"><label for="loginEmail" class="form-label">Email:</label><input type="email" class="form-control" id="loginEmail" name="email"></div>
<div class="mb-3"><label for="pwd" class="form-label">Contraseña:</label><input type="password" class="form-control" id="pwd" name="pswd"></div>
<button type="submit" class="btn btn-tokyo">Ingresar</button>
</form></div>
</div></div></div>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js"></script>
