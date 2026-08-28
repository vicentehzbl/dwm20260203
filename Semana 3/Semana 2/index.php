<html>
    <head>
        <title>Pagina Principal</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js"></script>
         <!--Estructura Footer-->
        <style>
            body {
                min-height: 100vh;
                display: flex;
                flex-direction: column;
            }

            .footer {
                margin-top: auto;
            }
        </style>        
    </head>
    <body>
        <!--Navbar -->
        <nav class="navbar navbar-expand-sm bg-dark navbar-dark">
            <div class="container-fluid">
                <a class="navbar-brand" href="index.php">VICENTE HORMAZÁBAL PACHECO</a>
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#collapsibleNavbar">
                    <span class="navbar-toggler-icon"></span>
                </button> 
                <div class="collapse navbar-collapse" id="collapsibleNavbar">
                    <ul class="navbar-nav">
                        <li class="nav-item dropdown">
                            <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">Empresa</a>
                            <ul class="dropdown-menu">
                                <li><a class="dropdown-item" href="empresa.php">Quienes Somos</a></li>
                                <li><a class="dropdown-item" href="#">Nuestro Equipo</a></li>
                                <li><a class="dropdown-item" href="#">Mision</a></li>
                            </ul>
                        </li>                        
                        <li class="nav-item">
                            <a class="nav-link" href="servicios.php">Servicios</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="productos.php">Productos</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="contacto.php">Contacto</a>
                        </li>                           
                    </ul>
                </div>  
                <button type="button" class="btn btn-outline-primary" data-bs-toggle="modal" data-bs-target="#myModal">Acceder</button>                             
            </div>
        </nav>
<<<<<<< HEAD:index.php
        <!-- Carousel -->
        <div id="demo" class="carousel slide" data-bs-ride="carousel">

        <!-- Indicators/dots -->
            <div class="carousel-indicators">

                <button type="button"
                        data-bs-target="#demo"
                        data-bs-slide-to="0"
                        class="active">
                </button>

                <button type="button"
                        data-bs-target="#demo"
                        data-bs-slide-to="1">
                </button>

                <button type="button"
                        data-bs-target="#demo"
                        data-bs-slide-to="2">
                </button>

            </div>

        <!-- Imágenes -->
            <div class="carousel-inner">

                <div class="carousel-item active">
                    <img src="img/la.jpg"
                        alt="Los Angeles"
                        class="d-block w-100">
                </div>

                <div class="carousel-item">
                    <img src="img/chicago.jpg"
                        alt="Chicago"
                        class="d-block w-100">
                </div>

                <div class="carousel-item">
                    <img src="img/ny.jpg"
                        alt="New York"
                        class="d-block w-100">
                </div>

            </div>

        <!-- Botón anterior -->
            <button class="carousel-control-prev"
                    type="button"
                    data-bs-target="#demo"
                    data-bs-slide="prev">

                <span class="carousel-control-prev-icon"></span>

            </button>

        <!-- Botón siguiente -->
            <button class="carousel-control-next"
                    type="button"
                    data-bs-target="#demo"
                    data-bs-slide="next">

                <span class="carousel-control-next-icon"></span>

            </button>

        </div>
        
        <!-- Container -->
        <div class="container-fluid bg-dark text-white text-center py-4">
            PRUEBA PRUEBA PRUEBA PRUEBA PRUEBA PRUEBA PRUEBA PRUEBA PRUEBA PRUEBA PRUEBA PRUEBA<br>
            <a href="index.php">Ir a Principal</a>
            <a href="empresa.php">Ir a Empresa</a>
            <a href="productos.php">Ir a Productos</a>
            <a href="servicios.php">Ir a Servicios</a>
            <a href="contacto.php">Ir a Contacto</a>
        </div>
        <!-- Alertas -->
        <div class="container-fluid">
            <div class="alert alert-success mt-3">
                <strong>Exito!</strong> Operación realizada con éxito.
            </div>
            <div class="alert alert-danger">
                <strong>Error!</strong> Ocurrió un error en la operación.
            </div>
            <div class="alert alert-warning">
                <strong>Advertencia!</strong> Operación realizada con advertencias.
            </div>
            <div class="alert alert-info">
                <strong>Información!</strong> Información importante para el usuario.
            </div>
        </div>
        <!-- Footer -->
        <div class="container-fluid bg-dark footer">
=======
        <!--Container-->
        <div class="container-fluid bg-warning">
            <a href="empresa.php">Ir a Empresa</a><br>
            <a href="servicios.php">Ir a Servicios</a><br>
            <a href="productos.php">Ir a Producto</a><br>
            <a href="Contacto.php">Ir a Contacto</a><br>
        </div>
        <!--Footer-->
        <div class="container-fluid bg-dark">
>>>>>>> aafc7c4f24fa6a2bfc81a759d0f05092ddc41686:Semana 2/index.php
            <div class="row">
                <div class="col-4"></div>
                <div class="col-4 text-center" style="color:white"><strong>MiEmpresa@2026</strong></div>
                <div class="col-4"></div>
            </div>
        </div>
        <!--Modal-->
        <div class="modal fade" id="myModal">
            <div class="modal-dialog">
                <div class="modal-content">
                    <!-- Modal Header -->
                    <div class="modal-header">
                        <h4 class="modal-title">Autenticacion</h4>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <!-- Modal body -->
                    <div class="modal-body">
                        <form action="empresa.php">
                            <div class="mb-3 mt-3">
                                <label for="email" class="form-label">Email:</label>
                                <input type="email" class="form-control" id="email" placeholder="Enter email" name="email">
                            </div>
                            <div class="mb-3">
                                <label for="pwd" class="form-label">Password:</label>
                                <input type="password" class="form-control" id="pwd" placeholder="Enter password" name="pswd">
                            </div>
                            <div class="form-check mb-3">
                                <label class="form-check-label">
                                <input class="form-check-input" type="checkbox" name="remember"> Remember me
                                </label>
                            </div>
                            <button type="submit" class="btn btn-primary">Login</button>
                        </form>
                    </div>
                    <!-- Modal footer -->
                    <div class="modal-footer">
                        <button type="button" class="btn btn-danger" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>        
    </body>
</html>