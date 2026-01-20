import { Sistema } from '../sistema.js';
import { MenuGlobal } from '../menu/global.js';
import { Filtros } from './filtros.js';
import { Geral } from './geral.js';
import { Consolidado } from './consolidado.js';
import { Performance } from './performance.js';
import { Matriz } from './matriz.js';

/**
 * Orquestrador de carregamento de dados por aba.
 * Exposto globalmente para ser chamado pelo objeto window.Produtividade definido no HTML.
 */
window.AppLoader = async function(tabId) {
    try {
        console.log(`[PerformancePro] Carregando dados para: ${tabId}`);
        
        switch(tabId) {
            case 'geral':
                // Verifica qual método de inicialização está disponível no módulo geral.js
                if (typeof Geral.carregarTela === 'function') await Geral.carregarTela();
                else if (typeof Geral.init === 'function') await Geral.init();
                break;
            case 'consolidado':
                await Consolidado.carregar();
                break;
            case 'performance':
                await Performance.carregar();
                break;
            case 'matriz':
                await Matriz.carregar();
                break;
            default:
                console.warn('Aba não reconhecida:', tabId);
        }
    } catch (error) {
        console.error(`Erro ao processar aba ${tabId}:`, error);
        if (typeof Sistema.notificar === 'function') {
            Sistema.notificar('Erro ao atualizar dados da aba.', 'error');
        }
    }
};

// Inicialização Principal ao carregar o DOM
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. Segurança: Verifica se o usuário está logado via Supabase/LocalStorage
        await Sistema.verificarSessao();
        
        // 2. UI: Renderiza o menu global (lateral/topo)
        if (window.Menu && window.Menu.Global) {
            window.Menu.Global.renderizar();
        } else {
            MenuGlobal.render('produtividade');
        }
        
        // 3. Filtros: Inicializa seletores de data e usuários
        if (Filtros && typeof Filtros.init === 'function') {
            await Filtros.init();
        }
        
        // 4. Início: Carrega a aba padrão
        const abaInicial = window.Produtividade ? window.Produtividade.abaAtiva : 'geral';
        await window.AppLoader(abaInicial);

    } catch (error) {
        console.error('Erro fatal na inicialização do módulo de produtividade:', error);
        if (Sistema && typeof Sistema.notificar === 'function') {
            Sistema.notificar('Erro crítico ao carregar o sistema.', 'error');
        }
    }
});