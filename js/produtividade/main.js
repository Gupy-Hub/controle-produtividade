import { Sistema } from '../sistema.js';
import { MenuGlobal } from '../menu/global.js';
import { Filtros } from './filtros.js';
import { Geral } from './geral.js';
import { Consolidado } from './consolidado.js';
import { Performance } from './performance.js';
import { Matriz } from './matriz.js';

// Inicialização Principal
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await Sistema.verificarSessao();
        MenuGlobal.render('produtividade'); // Renderiza Menu Lateral
        
        await Filtros.init(); // Inicializa Filtros (Data, Usuario)
        
        setupTabs();
        
        // Carrega a aba padrão (Geral) ou a que estiver ativa
        const activeTab = document.querySelector('.tab-btn.active-tab');
        if (activeTab) {
            loadTab(activeTab.dataset.tab);
        }

    } catch (error) {
        console.error('Erro fatal na inicialização:', error);
        Sistema.notificar('Erro ao carregar o sistema.', 'error');
    }
});

// Configuração das Abas
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            // UI Update
            document.querySelectorAll('.tab-btn').forEach(t => {
                t.classList.remove('active-tab', 'text-blue-600', 'border-blue-600');
                t.classList.add('text-gray-500', 'border-transparent');
            });
            
            e.currentTarget.classList.add('active-tab', 'text-blue-600', 'border-blue-600');
            e.currentTarget.classList.remove('text-gray-500', 'border-transparent');

            // Load Content
            const tabId = e.currentTarget.dataset.tab;
            loadTab(tabId);
        });
    });
}

// Lógica de Carregamento de Módulos
async function loadTab(tabId) {
    // Esconder todos os conteúdos
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    // Mostrar conteúdo alvo
    const targetContent = document.getElementById(`${tabId}-content`);
    if (targetContent) {
        targetContent.classList.remove('hidden');
    }

    // Trigger no Módulo Específico
    switch(tabId) {
        case 'geral':
            await Geral.init();
            break;
        case 'consolidado':
            await Consolidado.init();
            break;
        case 'performance':
            console.log('Carregando Performance...'); // Debug para verificar chamada
            await Performance.init();
            break;
        case 'matriz':
            await Matriz.init();
            break;
        default:
            console.warn('Aba desconhecida:', tabId);
    }
}

// Exportar para uso global se necessário (debug)
window.AppProdutividade = {
    loadTab
};