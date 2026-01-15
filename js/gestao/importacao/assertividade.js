window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

/**
 * MÓDULO DE IMPORTAÇÃO: ASSERTIVIDADE (NEXUS-CORE v5.0 - INDEX MODE)
 * ------------------------------------------------------------------
 * Correção Crítica:
 * 1. EscapeChar: '\\' -> Corrige leitura de campos com aspas e quebra de linha (\").
 * 2. Mapeamento por Índice: Resolve problema de colunas duplicadas ("Assistente").
 * 3. Robustez: Lê o arquivo cru (Array de Arrays) para evitar deslocamento de colunas.
 */
Gestao.Importacao.Assertividade = {
    init: function() {
        const inputId = 'input-csv-assertividade';
        const input = document.getElementById(inputId);
        
        if (input) {
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);
            
            newInput.addEventListener('change', (e) => {
                if(e.target.files.length > 0) this.processarArquivo(e.target.files[0]);
            });
        }
    },

    processarArquivo: function(file) {
        if (!file) return;

        const btn = document.getElementById('btn-importar-assert');
        const statusEl = document.getElementById('status-importacao-assert');
        
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mapeando...';
        if(statusEl) statusEl.innerHTML = '<span class="text-blue-600 font-semibold">Lendo colunas...</span>';

        Papa.parse(file, {
            header: false, // DESLIGADO: Faremos mapeamento manual para evitar erros de duplicidade
            skipEmptyLines: 'greedy',
            escapeChar: '\\', // CRÍTICO: Permite ler campos como "Texto com \"aspas\" internas"
            encoding: "UTF-8",
            complete: async (results) => {
                try {
                    await this.mapearESalvar(results.data, statusEl);
                } catch (error) {
                    console.error("Erro Fatal:", error);
                    alert("Erro crítico: " + error.message);
                } finally {
                    if(btn) btn.innerHTML = '<i class="fas fa-file-upload"></i> Importar CSV';
                    const input = document.getElementById('input-csv-assertividade');
                    if(input) input.value = '';
                    if(statusEl) setTimeout(() => statusEl.innerHTML = "", 5000);
                }
            },
            error: (err) => {
                alert("Erro CSV: " + err.message);
                if(btn) btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro';
            }
        });
    },

    mapearESalvar: async function(rows, statusEl) {
        if (!rows || rows.length < 2) {
            alert("Arquivo vazio ou sem cabeçalho.");
            return;
        }

        // 1. Identificar Índices das Colunas (Linha 0)
        // Normaliza para lowercase para facilitar busca
        const headers = rows[0].map(h => h.toString().trim().toLowerCase().replace(/"/g, ''));
        
        // Mapa de Índices (Busca dinâmica)
        const idx = {
            endTime: headers.findIndex(h => h === 'end_time' || h === 'end time' || h === 'data'),
            idAssistente: headers.findIndex(h => h === 'id_assistente' || h === 'id assistente' || h === 'id'),
            // Pega o PRIMEIRO 'assistente' que encontrar (geralmente Coluna F), mas salvamos o último também
            nomeAssistente1: headers.indexOf('assistente'),
            nomeAssistente2: headers.lastIndexOf('assistente'), 
            auditora: headers.findIndex(h => h === 'auditora' || h === 'auditor'),
            docName: headers.findIndex(h => h === 'doc_name' || h === 'documento' || h === 'nome da ppc'),
            status: headers.findIndex(h => h === 'status'),
            obs: headers.findIndex(h => h === 'apontamentos/obs' || h.includes('obs')),
            ok: headers.findIndex(h => h === 'ok'),
            nok: headers.findIndex(h => h === 'nok'),
            numCampos: headers.findIndex(h => h.includes('campos')),
            pct: headers.findIndex(h => h.includes('assert') || h === '%'),
            dataAudit: headers.findIndex(h => h.includes('data da auditoria')),
            empresa: headers.findIndex(h => h === 'empresa'),
            companyId: headers.findIndex(h => h === 'company_id')
        };

        // Validação Mínima
        if (idx.endTime === -1 || (idx.idAssistente === -1 && headers.indexOf('id ppc') === -1)) {
            // Tenta fallback para ID PPC se id_assistente falhar
            if(idx.idAssistente === -1) idx.idAssistente = headers.indexOf('id ppc');
            
            if (idx.endTime === -1) return alert("Erro: Coluna 'end_time' não encontrada.");
            if (idx.idAssistente === -1) return alert("Erro: Coluna 'id_assistente' não encontrada.");
        }

        // 2. Processamento das Linhas (Começa do índice 1)
        const validos = [];
        const diasEncontrados = new Set();
        let stats = { lidos: 0, ignorados: 0, semData: 0 };

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            
            // Segurança contra linha incompleta
            if (!row || row.length < 5) continue;

            // --- A. Extração da Data (Literal) ---
            const rawDate = row[idx.endTime];
            if (!rawDate || typeof rawDate !== 'string' || rawDate.length < 10) {
                stats.semData++;
                stats.ignorados++;
                continue;
            }
            // Pega YYYY-MM-DD ignorando o resto
            const dataLiteral = rawDate.substring(0, 10);
            
            // Valida formato básico (YYYY-MM-DD)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dataLiteral)) {
                // Tenta suporte a DD/MM/AAAA se o arquivo estiver diferente
                if (/^\d{2}\/\d{2}\/\d{4}/.test(dataLiteral)) {
                     // Converte DD/MM/AAAA -> AAAA-MM-DD
                     const parts = dataLiteral.split('/'); // [09, 12, 2025]
                     // A dataLiteral corrigida seria:
                     const corrected = `${parts[2]}-${parts[1]}-${parts[0]}`; // 2025-12-09
                     
                     // Adiciona a corrigida
                     diasEncontrados.add(corrected);
                     // Atualiza variável local para usar no objeto
                     // (Mas note que 'dataLiteral' é const no escopo do bloco, 
                     //  então vamos usar a 'corrected' no push abaixo)
                } else {
                    stats.semData++;
                    stats.ignorados++;
                    continue;
                }
            } else {
                diasEncontrados.add(dataLiteral);
            }
            
            const dataFinal = (/^\d{4}-\d{2}-\d{2}$/.test(dataLiteral)) ? dataLiteral : 
                              dataLiteral.split('/').reverse().join('-');

            // --- B. Extração do ID ---
            let idRaw = row[idx.idAssistente];
            let idAssistente = idRaw ? parseInt(idRaw.toString().replace(/\D/g, '')) : 0;
            
            if (!idAssistente) {
                stats.ignorados++;
                continue;
            }

            // --- C. Extração dos Outros Dados (Com Fallback) ---
            
            // Nome: Tenta coluna 'Assistente' principal, se vazio tenta a secundária
            let nome = (row[idx.nomeAssistente2] && row[idx.nomeAssistente2].length > 2) 
                        ? row[idx.nomeAssistente2] 
                        : (row[idx.nomeAssistente1] || '');

            // Porcentagem
            let pctVal = '0';
            if (idx.pct > -1 && row[idx.pct]) {
                pctVal = row[idx.pct].toString().replace('%','').replace(',','.').trim();
            }
            let pctFinal = (pctVal === '' || isNaN(parseFloat(pctVal))) ? 0 : parseFloat(pctVal).toFixed(2);

            // Data Auditoria
            let dtAudit = null;
            if (idx.dataAudit > -1 && row[idx.dataAudit]) {
                let da = row[idx.dataAudit];
                if (da.includes('/')) {
                    const parts = da.split('/');
                    if(parts.length === 3) dtAudit = `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
            }

            validos.push({
                usuario_id: idAssistente,
                nome_assistente: nome.trim(),
                nome_auditora_raw: (idx.auditora > -1 ? row[idx.auditora] : '').trim(),
                nome_documento: (idx.docName > -1 ? row[idx.docName] : '').trim(),
                status: (idx.status > -1 ? row[idx.status] : '').toUpperCase().trim(),
                observacao: (idx.obs > -1 ? row[idx.obs] : '').trim(),
                qtd_ok: (idx.ok > -1) ? (parseInt(row[idx.ok]) || 0) : 0,
                qtd_nok: (idx.nok > -1) ? (parseInt(row[idx.nok]) || 0) : 0,
                num_campos: (idx.numCampos > -1) ? (parseInt(row[idx.numCampos]) || 0) : 0,
                porcentagem: pctFinal,
                data_referencia: dataFinal,
                data_auditoria: dtAudit,
                empresa_nome: (idx.empresa > -1 ? row[idx.empresa] : '').trim(),
                empresa_id: (idx.companyId > -1) ? (parseInt(row[idx.companyId]) || 0) : 0
            });
            
            stats.lidos++;
        }

        if (validos.length === 0) {
            if(statusEl) statusEl.innerHTML = "";
            return alert(`Nenhum dado válido extraído.\nIgnorados: ${stats.ignorados}\nSem Data: ${stats.semData}`);
        }

        await this.salvarNoBanco(validos, Array.from(diasEncontrados), statusEl);
    },

    salvarNoBanco: async function(dados, dias, statusEl) {
        dias.sort();
        const diasFormatados = dias.map(d => d.split('-').reverse().join('/')).join(', ');
        
        const msg = `Resumo da Importação:\n\n` +
                    `📅 Período: \n[ ${diasFormatados} ]\n\n` +
                    `✅ Registros Completos: ${dados.length}\n` +
                    `⚠️ Substituição: Dados antigos destas datas serão APAGADOS.`;

        if (!confirm(msg)) {
            if(statusEl) statusEl.innerHTML = "Cancelado.";
            return;
        }

        if(statusEl) statusEl.innerHTML = `<span class="text-rose-600 font-bold">Limpando dados antigos...</span>`;

        // 1. Limpeza
        const { error: errDel } = await Sistema.supabase
            .from('assertividade')
            .delete()
            .in('data_referencia', dias);

        if (errDel) {
            console.error(errDel);
            alert("Erro ao limpar dados: " + errDel.message);
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        // 2. Inserção Lote
        const BATCH_SIZE = 500;
        let inseridos = 0;

        for (let i = 0; i < dados.length; i += BATCH_SIZE) {
            const lote = dados.slice(i, i + BATCH_SIZE);
            
            if(statusEl) {
                const pct = Math.round(((i + lote.length) / dados.length) * 100);
                statusEl.innerHTML = `<span class="text-orange-600 font-bold">Salvando... ${pct}%</span>`;
            }

            const { error } = await Sistema.supabase.from('assertividade').insert(lote);

            if (error) {
                console.error(error);
                alert(`Erro lote ${i}: ${error.message}`);
                return;
            }
            inseridos += lote.length;
        }

        alert(`Sucesso! ${inseridos} registros importados.`);
        if(statusEl) statusEl.innerHTML = '<span class="text-emerald-600 font-bold">Concluído!</span>';
        
        if(Gestao.Assertividade && typeof Gestao.Assertividade.buscarDados === 'function') {
            Gestao.Assertividade.buscarDados();
        }
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Gestao.Importacao.Assertividade.init());
} else {
    Gestao.Importacao.Assertividade.init();
}