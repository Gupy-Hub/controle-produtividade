<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Produtividade | Gupy Hub</title>
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- FontAwesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <!-- Chart.js -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <!-- Supabase -->
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <!-- PapaParse -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.0/papaparse.min.js"></script>
    
    <link rel="stylesheet" href="css/styles.css">
    <style>
        .animate-fade-in { animation: fadeIn 0.3s ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body class="bg-gray-50 text-gray-800 font-sans">

    <div class="flex h-screen overflow-hidden">
        <!-- Sidebar -->
        <aside class="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col z-10">
            <div class="p-6 border-b border-gray-100 flex items-center justify-center">
                <img src="img/logo.png" alt="Gupy Hub" class="h-10">
            </div>
            
            <nav class="flex-1 overflow-y-auto py-4" id="sidebar-menu">
                <!-- Menu será injetado via JS -->
            </nav>

            <div class="p-4 border-t border-gray-100">
                <button id="btn-logout" class="flex items-center w-full px-4 py-2 text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors">
                    <i class="fas fa-sign-out-alt mr-3"></i>
                    Sair
                </button>
            </div>
        </aside>

        <!-- Main Content -->
        <div class="flex-1 flex flex-col h-screen overflow-hidden relative">
            <!-- Mobile Header -->
            <header class="md:hidden bg-white border-b border-gray-200 p-4 flex justify-between items-center z-20">
                <img src="img/logo.png" alt="Gupy Hub" class="h-8">
                <button id="mobile-menu-btn" class="text-gray-600 focus:outline-none">
                    <i class="fas fa-bars text-2xl"></i>
                </button>
            </header>

            <!-- Top Bar / Filtros -->
            <div class="bg-white border-b border-gray-200 p-4 shadow-sm z-10">
                <div class="flex flex-col md:flex-row justify-between items-center gap-4">
                    <h1 class="text-xl font-bold text-gray-800 flex items-center">
                        <i class="fas fa-chart-line mr-2 text-blue-600"></i>
                        Gestão de Produtividade
                    </h1>
                    
                    <!-- Área de Filtros Globais -->
                    <div id="filtros-container" class="flex flex-wrap items-center gap-2 w-full md:w-auto">
                        <!-- Injetado via JS -->
                    </div>
                </div>

                <!-- Tabs de Navegação -->
                <div class="flex space-x-1 mt-6 border-b border-gray-200 overflow-x-auto no-scrollbar">
                    <button class="tab-btn px-4 py-2 text-sm font-medium text-gray-500 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-600 transition-all whitespace-nowrap active-tab" data-tab="geral">
                        Visão Geral
                    </button>
                    <button class="tab-btn px-4 py-2 text-sm font-medium text-gray-500 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-600 transition-all whitespace-nowrap" data-tab="consolidado">
                        Consolidado
                    </button>
                    <button class="tab-btn px-4 py-2 text-sm font-medium text-gray-500 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-600 transition-all whitespace-nowrap" data-tab="performance">
                        Performance
                    </button>
                    <button class="tab-btn px-4 py-2 text-sm font-medium text-gray-500 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-600 transition-all whitespace-nowrap" data-tab="matriz">
                        Matriz
                    </button>
                </div>
            </div>

            <!-- Content Area (Scrollable) -->
            <main class="flex-1 overflow-y-auto bg-gray-50 p-6" id="main-scroll">
                
                <!-- Feedback / Loading -->
                <div id="sistema-feedback" class="hidden mb-4 p-4 rounded-lg shadow-sm"></div>
                <div id="sistema-loading" class="hidden absolute inset-0 bg-white/80 z-50 flex items-center justify-center">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>

                <!-- Conteúdos das Abas -->
                
                <!-- Aba Geral -->
                <div id="geral-content" class="tab-content block animate-fade-in">
                    <!-- Conteúdo Geral -->
                </div>

                <!-- Aba Consolidado -->
                <div id="consolidado-content" class="tab-content hidden animate-fade-in">
                    <!-- Conteúdo Consolidado -->
                </div>

                <!-- Aba Performance (AQUI QUE O NOVO CÓDIGO VAI ENTRAR) -->
                <div id="performance-content" class="tab-content hidden animate-fade-in">
                    <!-- O JS Performance.js vai preencher aqui -->
                </div>

                <!-- Aba Matriz -->
                <div id="matriz-content" class="tab-content hidden animate-fade-in">
                    <!-- Conteúdo Matriz -->
                </div>

            </main>
        </div>
    </div>

    <!-- Modais -->
    <div id="modal-container"></div>

    <!-- Scripts -->
    <script type="module" src="js/produtividade/main.js"></script>
</body>
</html>