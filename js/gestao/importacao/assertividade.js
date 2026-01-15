window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

/**
 * MÓDULO DE IMPORTAÇÃO: ASSERTIVIDADE (NEXUS-CORE v4.2 - NO BLANKS)
 * -----------------------------------------------------------------
 * Correção Crítica: Impede importação de linhas sem data (end_time).
 * Regra: Sem 'end_time' = Lixo (Descarte imediato).
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
        
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Filtrando...';
        if(statusEl) statusEl.innerHTML = '<span class="text-blue-600 font-semibold"><i class="fas fa-filter"></i> Analisando end_time...</span>';

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true, // Ignora linhas totalmente vazias (,,,,)
            encoding: "UTF-8",
            transformHeader: function(h) {
                return h.trim().replace(/"/g, '').replace(/^\ufeff/, '').toLowerCase();
            },
            complete: async (results) => {
                try {
                    await this.filtrarESalvar(results.data, statusEl);
                } catch (error) {
                    console.error("Erro Fatal:", error);
                    alert("Erro na importação: " + error.message);
                } finally {
                    if(btn) btn.innerHTML = '<i class="fas fa-file-upload"></i> Importar CSV';
                    const input = document.getElementById('input-csv-assertividade');
                    if(input) input.value = '';
                    if(statusEl) setTimeout(() => statusEl.innerHTML = "", 5000);
                }
            },
            error: (err) => {
                alert("Erro leitura CSV: " + err.message);
                if(btn) btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro';
            }
        });
    },

    filtrarESalvar: async function(linhas, statusEl) {
        const validos = [];
        const diasEncontrados = new Set();
        let ignorados = 0;
        const OFF_SET_HORAS = 3; // Ajuste Fuso Brasil (GMT-3)

        for (const row of linhas) {
            // --- REGRA DE OURO: SEM DATA, SEM IMPORTAÇÃO ---
            
            // 1. Captura bruta
            let endTimeRaw = row['end_time'];

            // 2. Validação de nulidade e string vazia
            if (!endTimeRaw || typeof endTimeRaw !== 'string' || endTimeRaw.trim() === '') {
                ignorados++;
                continue; // Pula imediatamente
            }

            // 3. Validação de Data Válida (JS Date)
            const dataObj = new Date(endTimeRaw);
            if (isNaN(dataObj.getTime())) {
                ignorados++; // Data existe mas é inválida (ex: "N/A")
                continue;
            }

            // --- FIM DA VALIDAÇÃO DE DATA ---

            // Agora validamos o ID (Assistente)
            let idRaw = row['id_assistente'] || row['id'] || row['usuario_id'];
            if (!idRaw) {
                ignorados++;
                continue;
            }
            
            const idAssistente = parseInt(idRaw.toString().replace(/\D/g, ''));
            if (!idAssistente) {
                ignorados++;
                continue;
            }

            // Processamento da Data (Remover Hora e Ajustar Fuso)
            const timestampBrt = dataObj.getTime() - (OFF_SET_HORAS * 60 * 60 * 1000);
            const dataBrt = new Date(timestampBrt);
            const dataFinal = dataBrt.toISOString().split('T')[0]; // YYYY-MM-DD
            
            diasEncontrados.add(dataFinal);

            // Tratamento de Métricas
            let pctRaw = row['% assert'] || row['assert'] || row['assertividade'] || '0';
            let pctClean = pctRaw.toString().replace('%','').replace(',','.').trim();
            let pctFinal = (pctClean === '' || isNaN(parseFloat(pctClean))) ? 0 : parseFloat(pctClean).toFixed(2);

            let dataAudit = row['data da auditoria'] || null;
            if (dataAudit && dataAudit.includes('/')) {
                const parts = dataAudit.split('/');
                if(parts.length === 3) dataAudit = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }

            validos.push({
                usuario_id: idAssistente,
                nome_assistente: (row['assistente'] || '').trim(),
                nome_auditora_raw: (row['auditora'] || '').trim(),
                nome_documento: (row['doc_name'] || row['documento'] || '').trim(),
                status: (row['status'] || '').toUpperCase().trim(),
                observacao: (row['apontamentos/obs'] || row['observação'] || '').trim(),
                qtd_ok: parseInt(row['ok'] || 0),
                qtd_nok: parseInt(row['nok'] || 0),
                num_campos: parseInt(row['nº campos'] || 0),
                porcentagem: pctFinal,
                data_referencia: dataFinal,
                data_auditoria: dataAudit,
                empresa_nome: (row['empresa'] || '').trim(),
                empresa_id: parseInt(row['company_id'] || 0)
            });
        }

        // Feedback caso TUDO tenha sido filtrado (arquivo vazio ou colunas erradas)
        if (validos.length === 0) {
            if(statusEl) statusEl.innerHTML = "";
            return alert(`Nenhum dado válido encontrado.\n\nVerificado ${linhas.length} linhas.\nIgnoradas (sem data/id): ${ignorados}.\n\nCertifique-se que a coluna 'end_time' existe e contém datas.`);
        }

        await this.salvarNoBanco(validos, Array.from(diasEncontrados), statusEl);
    },

    salvarNoBanco: async function(dados, dias, statusEl) {
        dias.sort();
        const diasFormatados = dias.map(d => d.split('-').reverse().join('/')).join(', ');
        
        const msg = `Resumo da Importação:\n\n` +
                    `📅 Datas Válidas: \n[ ${diasFormatados} ]\n\n` +
                    `✅ Registros Prontos: ${dados.length}\n` +
                    `⚠️ Substituição: Dados antigos destas datas serão APAGADOS.`;

        if (!confirm(msg)) {
            if(statusEl) statusEl.innerHTML = "Cancelado.";
            return;
        }

        if(statusEl) statusEl.innerHTML = `<span class="text-rose-600 font-bold">Limpando registros antigos...</span>`;

        // 1. Limpeza Segura
        const { error: errDel } = await Sistema.supabase
            .from('assertividade')
            .delete()
            .in('data_referencia', dias); // Delete Partition (YYYY-MM-DD)

        if (errDel) {
            console.error(errDel);
            alert("Erro ao limpar dados antigos: " + errDel.message);
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        // 2. Inserção em Lote
        const BATCH_SIZE = 500;
        let inseridos = 0;

        for (let i = 0; i < dados.length; i += BATCH_SIZE) {
            const lote = dados.slice(i, i + BATCH_SIZE);
            
            if(statusEl) {
                const pct = Math.round(((i + lote.length) / dados.length) * 100);
                statusEl.innerHTML = `<span class="text-orange-600 font-bold">Salvando... ${pct}%</span>`;
            }

            const { error } = await Sistema.supabase
                .from('assertividade')
                .insert(lote);

            if (error) {
                console.error(error);
                alert(`Erro ao salvar lote: ${error.message}`);
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

// Auto-inicialização
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Gestao.Importacao.Assertividade.init());
} else {
    Gestao.Importacao.Assertividade.init();
}