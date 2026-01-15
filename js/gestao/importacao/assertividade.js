window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

/**
 * MÓDULO DE IMPORTAÇÃO: ASSERTIVIDADE (FINAL FIX v9.2)
 * ---------------------------------------------------------------------
 * Correções:
 * 1. Mapeamento da coluna 'nº Campos'.
 * 2. Envio de dados para colunas legadas (Empresa, ID, Obs).
 * 3. Uso de RPC segura.
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

        Papa.parse(file, {
            header: false, 
            skipEmptyLines: 'greedy',
            escapeChar: '\\', 
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

        // 1. Identificar cabeçalho e normalizar
        const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/"/g, ''));
        
        // 2. Criar Mapa de Índices (CORRIGIDO)
        const idx = {
            endTime: headers.findIndex(h => h.includes('end_time') || h === 'data'),
            idAssistente: headers.indexOf('id_assistente') !== -1 
                ? headers.indexOf('id_assistente') 
                : headers.findIndex(h => h.includes('id_assistente') || h === 'id' || h.includes('id ppc')),
            assistente: headers.lastIndexOf('assistente'), 
            auditora: headers.findIndex(h => h.includes('auditor') && !h.includes('data')),
            docName: headers.findIndex(h => h.includes('doc_name') || h.includes('documento')),
            status: headers.findIndex(h => h === 'status'),
            obs: headers.findIndex(h => h.includes('obs') || h.includes('apontamentos')),
            ok: headers.findIndex(h => h === 'ok'),
            nok: headers.findIndex(h => h === 'nok'),
            pct: headers.findIndex(h => h.includes('assert') || h === '%'),
            dataAudit: headers.findIndex(h => h.includes('data da auditoria')),
            empresa: headers.findIndex(h => h === 'empresa'),
            companyId: headers.findIndex(h => h.includes('company')),
            // NOVA CORREÇÃO: Captura a coluna de campos
            campos: headers.findIndex(h => h.includes('campos') || h.includes('nº campos'))
        };

        if (idx.endTime === -1) return alert("Erro: Coluna 'end_time' não encontrada.");
        if (idx.idAssistente === -1) return alert("Erro: Coluna 'id_assistente' não encontrada.");

        // 3. Extração
        const validos = [];
        const diasEncontrados = new Set();
        let stats = { lidos: 0, ignorados: 0, semData: 0 };

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 2) continue;

            // Data Referência
            const rawDate = row[idx.endTime];
            if (!rawDate || typeof rawDate !== 'string' || rawDate.length < 10) continue;
            const dataLiteral = rawDate.substring(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dataLiteral)) continue;
            
            diasEncontrados.add(dataLiteral);

            // ID
            let idRaw = row[idx.idAssistente];
            let idAssistente = idRaw ? parseInt(String(idRaw).replace(/\D/g, '')) : 0;
            if (!idAssistente) continue;

            // Porcentagem
            let pctVal = (idx.pct > -1 && row[idx.pct]) ? String(row[idx.pct]).replace('%','').replace(',','.').trim() : '0';
            let pctFinal = isNaN(parseFloat(pctVal)) ? 0 : parseFloat(pctVal).toFixed(2);

            // Data Auditoria
            let dtAudit = null;
            if (idx.dataAudit > -1 && row[idx.dataAudit]) {
                let da = String(row[idx.dataAudit]).trim();
                if (da.includes('/')) {
                    const parts = da.split('/'); 
                    if(parts.length === 3) dtAudit = `${parts[2]}-${parts[1]}-${parts[0]}`;
                } else if (/^\d{4}-\d{2}-\d{2}/.test(da)) {
                    dtAudit = da.substring(0, 10);
                }
            }

            // Nº Campos (Novo)
            let numCampos = (idx.campos > -1 && row[idx.campos]) ? (parseInt(row[idx.campos]) || 0) : 0;

            validos.push({
                usuario_id: idAssistente,
                nome_assistente: (idx.assistente > -1 ? String(row[idx.assistente]||'') : '').trim(),
                nome_auditora_raw: (idx.auditora > -1 ? String(row[idx.auditora]||'') : '').trim(),
                nome_documento: (idx.docName > -1 ? String(row[idx.docName]||'') : '').trim(),
                status: (idx.status > -1 ? String(row[idx.status]||'') : '').toUpperCase().trim(),
                observacao: (idx.obs > -1 ? String(row[idx.obs]||'') : '').trim(),
                qtd_ok: (idx.ok > -1) ? (parseInt(row[idx.ok]) || 0) : 0,
                qtd_nok: (idx.nok > -1) ? (parseInt(row[idx.nok]) || 0) : 0,
                num_campos: numCampos, // Agora extraído corretamente
                porcentagem: pctFinal,
                data_referencia: dataLiteral,
                data_auditoria: dtAudit,
                empresa_nome: (idx.empresa > -1 ? String(row[idx.empresa]||'') : '').trim(),
                empresa_id: (idx.companyId > -1) ? (parseInt(row[idx.companyId]) || 0) : 0
            });
        }

        if (validos.length === 0) return alert(`Nenhuma linha válida importada.`);

        await this.salvarNoBanco(validos, Array.from(diasEncontrados), statusEl);
    },

    salvarNoBanco: async function(dados, dias, statusEl) {
        dias.sort();
        const diasFormatados = dias.map(d => d.split('-').reverse().join('/')).join(', ');
        
        const msg = `Resumo da Importação:\n\n` +
                    `📅 Dias: \n[ ${diasFormatados} ]\n\n` +
                    `✅ Registros: ${dados.length}\n` +
                    `⚠️ Atenção: Os dados antigos destas datas serão SUBSTITUÍDOS.`;

        if (!confirm(msg)) {
            if(statusEl) statusEl.innerHTML = "Cancelado.";
            return;
        }

        if(statusEl) statusEl.innerHTML = `<span class="text-rose-600 font-bold">Limpando dados antigos...</span>`;

        const { error: errDel } = await Sistema.supabase
            .rpc('limpar_assertividade_dias', { dias: dias });

        if (errDel) {
            alert("Erro ao limpar dados: " + errDel.message);
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        const BATCH_SIZE = 500;
        let inseridos = 0;

        for (let i = 0; i < dados.length; i += BATCH_SIZE) {
            const lote = dados.slice(i, i + BATCH_SIZE);
            if(statusEl) {
                const pct = Math.round(((i + lote.length) / dados.length) * 100);
                statusEl.innerHTML = `<span class="text-orange-600 font-bold">Enviando... ${pct}%</span>`;
            }

            const { error } = await Sistema.supabase
                .rpc('importar_assertividade_lote', { dados: lote });

            if (error) {
                alert(`Erro no lote ${i}: ${error.message}`);
                return;
            }
            inseridos += lote.length;
        }

        alert(`Sucesso! ${inseridos} registros importados com todas as colunas.`);
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