window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

/**
 * MÓDULO DE IMPORTAÇÃO: ASSERTIVIDADE (NEXUS-CORE v4.1 - STRICT MODE)
 * -------------------------------------------------------------------
 * Diretivas de Atualização:
 * 1. Fonte de Verdade Única: Coluna 'end_time'.
 * 2. Limpeza Rigorosa: Linhas em branco ou sem data são descartadas.
 * 3. Sanitização Temporal: Remove a hora, mantendo apenas a DATA (YYYY-MM-DD) ajustada para BRT.
 */
Gestao.Importacao.Assertividade = {
    init: function() {
        const inputId = 'input-csv-assertividade';
        const input = document.getElementById(inputId);
        
        if (input) {
            // Reinicia o elemento para remover listeners antigos e garantir clean state
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
        
        // Feedback Visual
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
        if(statusEl) statusEl.innerHTML = '<span class="text-blue-600 font-semibold"><i class="fas fa-filter"></i> Lendo end_time...</span>';

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true, // Primeiro filtro do PapaParse
            encoding: "UTF-8",
            transformHeader: function(h) {
                // Normaliza cabeçalhos para minúsculo e remove aspas/espaços
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
                alert("Erro ao ler o arquivo: " + err.message);
                if(btn) btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro';
            }
        });
    },

    filtrarESalvar: async function(linhas, statusEl) {
        const validos = [];
        const diasEncontrados = new Set();
        let ignorados = 0;

        // Fuso Horário de Referência (Brasil -3h)
        // Usado para garantir que a quebra do dia aconteça no horário local, não UTC
        const OFF_SET_HORAS = 3; 

        for (const row of linhas) {
            // 1. Validação Estrita de ID
            // Se não tem ID, é lixo ou linha em branco residual
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

            // 2. Validação Estrita de END_TIME
            // O usuário ordenou: "importar pela coluna End_time". Outras colunas são ignoradas.
            const endTimeRaw = row['end_time'];
            
            if (!endTimeRaw) {
                // Se a linha tem dados mas não tem end_time, ela não serve.
                ignorados++;
                continue;
            }

            // 3. Extração da DATA (Ignorando Hora)
            // Formato esperado: ISO (2025-12-02T12:17:04.332Z) ou similar
            const dataObj = new Date(endTimeRaw);
            
            if (isNaN(dataObj.getTime())) {
                ignorados++; // Data inválida
                continue;
            }

            // Ajuste para Data Lógica (BRT)
            // Subtrai 3h do timestamp para pegar o dia correto no Brasil
            const timestampBrt = dataObj.getTime() - (OFF_SET_HORAS * 60 * 60 * 1000);
            const dataBrt = new Date(timestampBrt);
            
            // Extrai YYYY-MM-DD
            const dataFinal = dataBrt.toISOString().split('T')[0];
            
            diasEncontrados.add(dataFinal);

            // 4. Tratamento de Métricas
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
                data_referencia: dataFinal, // AQUI: Data limpa (YYYY-MM-DD)
                data_auditoria: dataAudit,
                empresa_nome: (row['empresa'] || '').trim(),
                empresa_id: parseInt(row['company_id'] || 0)
            });
        }

        if (validos.length === 0) {
            if(statusEl) statusEl.innerHTML = "";
            return alert(`Nenhum registro válido.\n\nCritérios:\n1. Coluna 'end_time' obrigatória.\n2. Coluna 'id_assistente' obrigatória.\n3. Data válida.`);
        }

        await this.salvarNoBanco(validos, Array.from(diasEncontrados), statusEl);
    },

    salvarNoBanco: async function(dados, dias, statusEl) {
        dias.sort();
        const diasFormatados = dias.map(d => d.split('-').reverse().join('/')).join(', ');
        
        const msg = `Resumo da Importação:\n\n` +
                    `📅 Datas (baseado em end_time): \n${diasFormatados}\n\n` +
                    `📝 Registros Válidos: ${dados.length}\n` +
                    `⚠️ Atenção: Dados anteriores destas datas serão SUBSTITUÍDOS.`;

        if (!confirm(msg)) {
            if(statusEl) statusEl.innerHTML = "Cancelado.";
            return;
        }

        if(statusEl) statusEl.innerHTML = `<span class="text-rose-600 font-bold">Limpando dados antigos...</span>`;

        // 1. Limpeza por Data (Delete-Partition)
        const { error: errDel } = await Sistema.supabase
            .from('assertividade')
            .delete()
            .in('data_referencia', dias); // Apaga exatamente os dias YYYY-MM-DD encontrados

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
        
        // Atualiza tabela se existir
        if(Gestao.Assertividade && typeof Gestao.Assertividade.buscarDados === 'function') {
            Gestao.Assertividade.buscarDados();
        }
    }
};

// Auto-inicialização segura
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Gestao.Importacao.Assertividade.init());
} else {
    Gestao.Importacao.Assertividade.init();
}