window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

/**
 * MÓDULO DE IMPORTAÇÃO: ASSERTIVIDADE (NEXUS-CORE v4.0)
 * -----------------------------------------------------
 * Responsável pelo parsing, validação e persistência de dados de assertividade (CSV).
 * Garante idempotência via estratégia "Delete-Partition-Insert" baseada em dias.
 */
Gestao.Importacao.Assertividade = {
    // Configuração de Fuso Horário (BRT)
    TIMEZONE_OFFSET: -3, 

    init: function() {
        const inputId = 'input-csv-assertividade';
        const input = document.getElementById(inputId);
        
        if (input) {
            // Remove listeners antigos clonando o elemento (Pattern: Event Listener Cleanup)
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);
            
            newInput.addEventListener('change', (e) => {
                if(e.target.files.length > 0) this.processarArquivo(e.target.files[0]);
            });
            console.log(`[NEXUS] Listener anexado ao input: ${inputId}`);
        } else {
            console.warn(`[NEXUS] Input ${inputId} não encontrado no DOM.`);
        }
    },

    processarArquivo: function(file) {
        if (!file) return;

        const btn = document.getElementById('btn-importar-assert');
        const statusEl = document.getElementById('status-importacao-assert');
        
        // Estado de Carregamento
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
        if(statusEl) statusEl.innerHTML = '<span class="text-blue-600 font-semibold"><i class="fas fa-microchip"></i> Analisando estrutura...</span>';

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            // Sanitização de Cabeçalhos: Remove BOM, aspas e normaliza para minúsculo
            transformHeader: function(h) {
                return h.trim().replace(/"/g, '').replace(/^\ufeff/, '').toLowerCase();
            },
            complete: async (results) => {
                try {
                    console.log(`[NEXUS] CSV Lido. Total Linhas: ${results.data.length}`);
                    await this.analisarESalvar(results.data, statusEl);
                } catch (error) {
                    console.error("[NEXUS] Erro crítico no fluxo:", error);
                    alert("Erro fatal na importação: " + error.message);
                } finally {
                    // Reset de UI
                    if(btn) btn.innerHTML = '<i class="fas fa-file-upload"></i> Importar CSV';
                    const input = document.getElementById('input-csv-assertividade');
                    if(input) input.value = '';
                    if(statusEl) setTimeout(() => statusEl.innerHTML = "", 8000);
                }
            },
            error: (err) => {
                console.error("[NEXUS] Erro PapaParse:", err);
                alert("Falha na leitura do arquivo CSV. Verifique a codificação.");
                if(btn) btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro';
                if(statusEl) statusEl.innerHTML = '<span class="text-red-500">Erro na leitura</span>';
            }
        });
    },

    /**
     * Normaliza dados e agrupa por Dia de Referência para validação de duplicidade.
     */
    analisarESalvar: async function(linhas, statusEl) {
        if(statusEl) statusEl.innerHTML = `<span class="text-purple-600 font-semibold"><i class="fas fa-filter"></i> Normalizando dados...</span>`;

        const validos = [];
        const diasEncontrados = new Set();
        let ignorados = 0;

        for (const row of linhas) {
            // 1. Extração de ID (Resiliência contra sujeira no CSV)
            let idRaw = row['id_assistente'] || row['id assistente'] || row['usuario_id'] || row['id'];
            let idAssistente = idRaw ? parseInt(idRaw.toString().replace(/\D/g, '')) : null;

            if (!idAssistente) {
                ignorados++; // Linha sem ID vinculável
                continue; 
            }

            // 2. Data Referência (Prioridade: end_time > data > created_at)
            let dataRefRaw = row['end_time'] || row['data'] || row['date'] || row['created_at'];
            if (!dataRefRaw || !this.isDateValid(dataRefRaw)) {
                ignorados++;
                continue;
            }

            // 3. Cálculo do Dia de Referência (Fuso BRT)
            // Extrai o dia "lógico" (YYYY-MM-DD) baseado no timestamp ajustado para GMT-3
            const dataRefObj = new Date(dataRefRaw);
            const diaLogico = this.getDiaLogicoBRT(dataRefObj);
            diasEncontrados.add(diaLogico);

            // 4. Normalização de Métricas
            // Porcentagem: Trata "95,5%", "95.5", ou vazio
            let pctRaw = row['% assert'] || row['assert'] || row['% assertividade'] || row['assertividade'] || '0';
            let pctClean = pctRaw.toString().replace('%','').replace(',','.').trim();
            let pctFinal = (pctClean === '' || isNaN(parseFloat(pctClean))) ? 0 : parseFloat(pctClean).toFixed(2);

            // Data Auditoria: Converte DD/MM/AAAA para YYYY-MM-DD
            let dataAudit = row['data da auditoria'] || row['data auditoria'] || null;
            if (dataAudit && dataAudit.includes('/')) {
                const parts = dataAudit.split('/');
                if(parts.length === 3) dataAudit = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }

            validos.push({
                usuario_id: idAssistente,
                nome_assistente: (row['assistente'] || '').trim(),
                nome_auditora_raw: (row['auditora'] || '').trim(),
                nome_documento: (row['doc_name'] || row['documento'] || row['nome da ppc'] || '').trim(),
                status: (row['status'] || '').toUpperCase().trim(),
                observacao: (row['apontamentos/obs'] || row['observação'] || row['obs'] || '').trim(),
                qtd_ok: parseInt(row['ok'] || 0),
                qtd_nok: parseInt(row['nok'] || 0),
                num_campos: parseInt(row['nº campos'] || row['num campos'] || 0),
                porcentagem: pctFinal,
                data_referencia: dataRefRaw, // Mantém timestamp original para precisão
                data_referencia_dia: diaLogico, // Campo auxiliar (se existir no banco) ou usado apenas para logica
                data_auditoria: dataAudit,
                empresa_nome: (row['empresa'] || '').trim(),
                empresa_id: parseInt(row['company_id'] || 0)
            });
        }

        if (validos.length === 0) {
            if(statusEl) statusEl.innerHTML = "";
            return alert(`Nenhum dado válido encontrado.\n\nVerifique se o CSV contém as colunas: 'id_assistente' e 'end_time'.\nLinhas ignoradas: ${ignorados}`);
        }

        // --- PROTOCOLO DE IDEMPOTÊNCIA ---
        await this.executarTransacaoSegura(validos, Array.from(diasEncontrados), statusEl);
    },

    executarTransacaoSegura: async function(dados, dias, statusEl) {
        // Ordena dias para exibição
        dias.sort();
        const diasFormatados = dias.map(d => d.split('-').reverse().join('/')).join(', ');

        const confirmMsg = `Confirmar Importação de Assertividade?\n\n` +
                           `📅 Dias Detectados: \n[ ${diasFormatados} ]\n\n` +
                           `⚠️ ATENÇÃO: Todos os registros ANTERIORES destas datas serão APAGADOS e substituídos pelos novos dados.\n` +
                           `📊 Registros Novos: ${dados.length}`;

        if (!confirm(confirmMsg)) {
            if(statusEl) statusEl.innerHTML = "Importação cancelada pelo usuário.";
            return;
        }

        if(statusEl) statusEl.innerHTML = `<span class="text-rose-600 font-bold"><i class="fas fa-eraser"></i> Limpando versões anteriores...</span>`;

        // 1. Limpeza (DELETE) por Range de Data (Dia Completo)
        // Isso garante que não sobrem "fantasmas" se o horário da reimportação for diferente
        for (const dia of dias) {
            // Define o intervalo do dia em UTC (ou local, dependendo de como o banco está configurado)
            // Considerando que 'data_referencia' no banco é TIMESTAMPTZ ou TIMESTAMP
            // A query abaixo assume que data_referencia é comparável com string ISO.
            
            // Início: Dia 00:00:00 | Fim: Dia 23:59:59.999
            // A comparação textual funciona bem se o formato no banco for ISO 8601
            const inicioDia = `${dia}T00:00:00`; 
            const fimDia = `${dia}T23:59:59.999`;

            // Nota: Se o banco estiver salvando com offset, o ideal é usar filtro de data,
            // mas range de string ISO costuma ser seguro para colunas TIMESTAMP.
            // Para maior precisão, usamos gte/lte nas strings ISO parciais se o banco aceitar,
            // ou filtro customizado. Assumindo comportamento padrão PostgREST:
            
            const { error: errDel } = await Sistema.supabase
                .from('assertividade')
                .delete()
                .gte('data_referencia', inicioDia) // >= YYYY-MM-DDT00:00:00
                .lte('data_referencia', fimDia);   // <= YYYY-MM-DDT23:59:59
            
            if (errDel) {
                console.error(`Erro ao limpar dia ${dia}:`, errDel);
                alert(`Erro ao limpar dados do dia ${dia}. A operação foi abortada para evitar duplicidade.`);
                if(statusEl) statusEl.innerHTML = "";
                return;
            }
        }

        // 2. Inserção em Lote (Batch Insert)
        const BATCH_SIZE = 500;
        let inseridos = 0;
        
        for (let i = 0; i < dados.length; i += BATCH_SIZE) {
            const lote = dados.slice(i, i + BATCH_SIZE);
            
            // Removemos campos auxiliares que não existem no banco antes de enviar
            const loteLimpo = lote.map(item => {
                const { data_referencia_dia, ...resto } = item; 
                return resto;
            });

            if(statusEl) {
                const pct = Math.round(((i + lote.length) / dados.length) * 100);
                statusEl.innerHTML = `<span class="text-orange-600 font-bold"><i class="fas fa-upload"></i> Enviando... ${pct}%</span>`;
            }

            const { error } = await Sistema.supabase
                .from('assertividade')
                .insert(loteLimpo);

            if (error) {
                console.error("Erro Insert Batch:", error);
                if (error.code === 'PGRST204') {
                    alert(`Erro de Schema: Coluna inexistente detectada (${error.message}). Notifique o suporte.`);
                } else {
                    alert(`Erro na gravação do lote ${i}: ${error.message}`);
                }
                if(statusEl) statusEl.innerHTML = `<span class="text-red-600">Falha na gravação.</span>`;
                return;
            }
            inseridos += lote.length;
        }

        // Sucesso
        const msgSucesso = `✅ Sucesso! ${inseridos} registros atualizados em ${dias.length} datas.`;
        alert(msgSucesso);
        if(statusEl) statusEl.innerHTML = '<span class="text-emerald-600 font-bold"><i class="fas fa-check-circle"></i> Concluído!</span>';

        // Atualização da View (se disponível)
        if(Gestao.Assertividade && typeof Gestao.Assertividade.buscarDados === 'function') {
            Gestao.Assertividade.buscarDados();
        }
    },

    // --- Helpers Utilitários ---

    isDateValid: function(dateStr) {
        const d = new Date(dateStr);
        return d instanceof Date && !isNaN(d);
    },

    /**
     * Retorna o dia (YYYY-MM-DD) correspondente ao fuso horário brasileiro,
     * dado um objeto Date (que pode estar em UTC).
     */
    getDiaLogicoBRT: function(dateObj) {
        // Ajuste manual simples para garantir o dia correto independente do browser
        // Subtrai 3 horas do tempo UTC para obter o horário BRT aproximado
        // (Nota: Isso assume que a entrada UTC está correta. 
        // Se a entrada já for local, o JS trata sozinho, mas 'end_time' costuma vir com 'Z')
        const ms = dateObj.getTime();
        const brtDate = new Date(ms - (3 * 60 * 60 * 1000)); 
        return brtDate.toISOString().split('T')[0];
    }
};

// Inicialização segura
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Gestao.Importacao.Assertividade.init());
} else {
    Gestao.Importacao.Assertividade.init();
}