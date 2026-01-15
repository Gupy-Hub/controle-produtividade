window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

/**
 * MÓDULO DE IMPORTAÇÃO: ASSERTIVIDADE (NEXUS-CORE v8.0 - CSV ULTIMATE)
 * ---------------------------------------------------------------------
 * Foco: Performance e Correção de Parsing de CSV "Sujo".
 * 1. escapeChar: '\\' -> Corrige a leitura de campos com aspas internas.
 * 2. Data Literal: Garante que a data do arquivo seja respeitada (sem fuso).
 * 3. Validação: Ignora linhas sem ID ou sem Data.
 */
Gestao.Importacao.Assertividade = {
    init: function() {
        const inputId = 'input-csv-assertividade';
        const input = document.getElementById(inputId);
        
        if (input) {
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);
            
            newInput.addEventListener('change', (e) => {
                if(e.target.files.length > 0) this.processarCSV(e.target.files[0]);
            });
        }
    },

    processarCSV: function(file) {
        if (!file) return;

        const btn = document.getElementById('btn-importar-assert');
        const statusEl = document.getElementById('status-importacao-assert');
        
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo CSV...';
        if(statusEl) statusEl.innerHTML = '<span class="text-blue-600 font-semibold">Processando arquivo...</span>';

        // Configuração ESPECÍFICA para o seu tipo de CSV
        Papa.parse(file, {
            header: false, // Vamos mapear manualmente para evitar erros de duplicidade de nome
            skipEmptyLines: 'greedy',
            escapeChar: '\\', // CRÍTICO: Permite ler campos como "Texto com \"aspas\" internas"
            encoding: "UTF-8",
            complete: async (results) => {
                try {
                    await this.mapearESalvar(results.data, statusEl);
                } catch (error) {
                    console.error("Erro Fatal:", error);
                    alert("Erro crítico na importação: " + error.message);
                } finally {
                    if(btn) btn.innerHTML = '<i class="fas fa-file-upload"></i> Importar CSV';
                    const input = document.getElementById('input-csv-assertividade');
                    if(input) input.value = '';
                    if(statusEl) setTimeout(() => statusEl.innerHTML = "", 5000);
                }
            },
            error: (err) => {
                alert("Erro ao ler o arquivo CSV: " + err.message);
                if(btn) btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro';
            }
        });
    },

    mapearESalvar: async function(rows, statusEl) {
        if (!rows || rows.length < 2) {
            return alert("O arquivo CSV parece estar vazio ou sem cabeçalho.");
        }

        // 1. Identificar a linha de cabeçalho (Linha 0)
        const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/"/g, ''));
        
        // 2. Criar Mapa de Índices (Onde está cada coluna?)
        const idx = {
            endTime: headers.findIndex(h => h.includes('end_time') || h === 'data'),
            idAssistente: headers.findIndex(h => h.includes('id_assistente') || h === 'id' || h.includes('id ppc')),
            // Pega a última coluna chamada 'assistente' (geralmente a mais completa)
            assistente: headers.lastIndexOf('assistente'), 
            auditora: headers.findIndex(h => h.includes('auditor')),
            docName: headers.findIndex(h => h.includes('doc_name') || h.includes('documento')),
            status: headers.findIndex(h => h === 'status'),
            obs: headers.findIndex(h => h.includes('obs') || h.includes('apontamentos')),
            ok: headers.findIndex(h => h === 'ok'),
            nok: headers.findIndex(h => h === 'nok'),
            pct: headers.findIndex(h => h.includes('assert') || h === '%'),
            dataAudit: headers.findIndex(h => h.includes('data da auditoria')),
            empresa: headers.findIndex(h => h === 'empresa'),
            companyId: headers.findIndex(h => h.includes('company'))
        };

        // Validação Mínima
        if (idx.endTime === -1) return alert("Erro: Coluna 'end_time' não encontrada no CSV.");
        if (idx.idAssistente === -1) return alert("Erro: Coluna de ID (id_assistente ou id ppc) não encontrada.");

        // 3. Extração de Dados
        const validos = [];
        const diasEncontrados = new Set();
        let stats = { lidos: 0, ignorados: 0, semData: 0 };

        // Começa da linha 1 (pula cabeçalho)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            
            // Segurança básica
            if (!row || row.length < 2) continue;

            // A. DATA (Literal do CSV)
            const rawDate = row[idx.endTime];
            if (!rawDate || typeof rawDate !== 'string' || rawDate.length < 10) {
                stats.semData++;
                continue;
            }
            
            // Corta os 10 primeiros caracteres: "2025-12-02T..." -> "2025-12-02"
            const dataLiteral = rawDate.substring(0, 10);
            
            // Valida formato YYYY-MM-DD
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dataLiteral)) {
                stats.semData++;
                continue;
            }
            
            diasEncontrados.add(dataLiteral);

            // B. ID
            let idRaw = row[idx.idAssistente];
            let idAssistente = idRaw ? parseInt(String(idRaw).replace(/\D/g, '')) : 0;
            
            if (!idAssistente) {
                stats.ignorados++;
                continue;
            }

            // C. Outros Campos
            let pctVal = (idx.pct > -1 && row[idx.pct]) ? String(row[idx.pct]).replace('%','').replace(',','.').trim() : '0';
            let pctFinal = isNaN(parseFloat(pctVal)) ? 0 : parseFloat(pctVal).toFixed(2);

            let dtAudit = null;
            if (idx.dataAudit > -1 && row[idx.dataAudit]) {
                let da = String(row[idx.dataAudit]).trim();
                if (da.includes('/')) {
                    const parts = da.split('/'); // DD/MM/AAAA
                    if(parts.length === 3) dtAudit = `${parts[2]}-${parts[1]}-${parts[0]}`;
                } else if (/^\d{4}-\d{2}-\d{2}/.test(da)) {
                    dtAudit = da.substring(0, 10);
                }
            }

            validos.push({
                usuario_id: idAssistente,
                nome_assistente: (idx.assistente > -1 ? String(row[idx.assistente]||'') : '').trim(),
                nome_auditora_raw: (idx.auditora > -1 ? String(row[idx.auditora]||'') : '').trim(),
                nome_documento: (idx.docName > -1 ? String(row[idx.docName]||'') : '').trim(),
                status: (idx.status > -1 ? String(row[idx.status]||'') : '').toUpperCase().trim(),
                observacao: (idx.obs > -1 ? String(row[idx.obs]||'') : '').trim(),
                qtd_ok: (idx.ok > -1) ? (parseInt(row[idx.ok]) || 0) : 0,
                qtd_nok: (idx.nok > -1) ? (parseInt(row[idx.nok]) || 0) : 0,
                num_campos: 0, // Campo não crítico
                porcentagem: pctFinal,
                data_referencia: dataLiteral,
                data_auditoria: dtAudit,
                empresa_nome: (idx.empresa > -1 ? String(row[idx.empresa]||'') : '').trim(),
                empresa_id: (idx.companyId > -1) ? (parseInt(row[idx.companyId]) || 0) : 0
            });
            
            stats.lidos++;
        }

        if (validos.length === 0) {
            if(statusEl) statusEl.innerHTML = "";
            return alert(`Nenhuma linha válida importada.\n\nVerifique:\n1. Se a coluna 'end_time' existe.\n2. Se as datas estão no formato AAAA-MM-DD.\n3. Se os IDs estão preenchidos.`);
        }

        await this.salvarNoBanco(validos, Array.from(diasEncontrados), statusEl);
    },

    salvarNoBanco: async function(dados, dias, statusEl) {
        dias.sort();
        const diasFormatados = dias.map(d => d.split('-').reverse().join('/')).join(', ');
        
        const msg = `Resumo da Importação (CSV):\n\n` +
                    `📅 Dias Detectados: \n[ ${diasFormatados} ]\n\n` +
                    `✅ Registros Prontos: ${dados.length}\n` +
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
            alert("Erro ao limpar dados: " + errDel.message);
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        // 2. Inserção em Lote
        const BATCH_SIZE = 1000; // CSV é leve, podemos aumentar o lote
        let inseridos = 0;

        for (let i = 0; i < dados.length; i += BATCH_SIZE) {
            const lote = dados.slice(i, i + BATCH_SIZE);
            
            if(statusEl) {
                const pct = Math.round(((i + lote.length) / dados.length) * 100);
                statusEl.innerHTML = `<span class="text-orange-600 font-bold">Enviando... ${pct}%</span>`;
            }

            const { error } = await Sistema.supabase.from('assertividade').insert(lote);

            if (error) {
                console.error("Erro insert:", error);
                alert(`Erro no lote ${i}: ${error.message}`);
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