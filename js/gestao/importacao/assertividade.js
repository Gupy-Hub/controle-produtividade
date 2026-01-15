window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

/**
 * MÓDULO DE IMPORTAÇÃO: ASSERTIVIDADE (NEXUS-CORE v4.3 - UTC LITERAL)
 * --------------------------------------------------------------------
 * Ajuste Crítico: Utiliza a data literal do ISO String (UTC) para
 * evitar que horários da madrugada (ex: 01:38) sejam movidos para o dia anterior.
 * * Exemplo: '2025-12-06T01:38:30Z' será importado como '2025-12-06'.
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
        
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
        if(statusEl) statusEl.innerHTML = '<span class="text-blue-600 font-semibold"><i class="fas fa-calendar-alt"></i> Lendo datas (UTC)...</span>';

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true, // Garante que linhas vazias no fim do arquivo sejam ignoradas
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

        for (const row of linhas) {
            // 1. Validação de DATA (end_time) - CRITÉRIO PRINCIPAL
            let endTimeRaw = row['end_time'];

            // Se estiver vazio, nulo ou apenas espaços, ignora
            if (!endTimeRaw || typeof endTimeRaw !== 'string' || endTimeRaw.trim() === '') {
                ignorados++;
                continue; 
            }

            // Tenta criar objeto data para validar integridade
            const dataObj = new Date(endTimeRaw);
            if (isNaN(dataObj.getTime())) {
                ignorados++; 
                continue;
            }

            // 2. Extração da Data Literal (UTC)
            // Se o arquivo diz "2025-12-06T01:38...", queremos "2025-12-06"
            // Usamos .toISOString() que retorna sempre em UTC, e pegamos a parte da data
            const dataFinal = dataObj.toISOString().split('T')[0];
            
            diasEncontrados.add(dataFinal);

            // 3. Validação do ID (Assistente)
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
                data_referencia: dataFinal, // Agora gravando a data LITERAL do arquivo
                data_auditoria: dataAudit,
                empresa_nome: (row['empresa'] || '').trim(),
                empresa_id: parseInt(row['company_id'] || 0)
            });
        }

        if (validos.length === 0) {
            if(statusEl) statusEl.innerHTML = "";
            return alert(`Nenhum dado válido.\n\nIgnorados: ${ignorados}\nVerifique se a coluna 'end_time' está preenchida corretamente.`);
        }

        await this.salvarNoBanco(validos, Array.from(diasEncontrados), statusEl);
    },

    salvarNoBanco: async function(dados, dias, statusEl) {
        // Ordena para visualização
        dias.sort();
        const diasFormatados = dias.map(d => d.split('-').reverse().join('/')).join(', ');
        
        const msg = `Resumo da Importação:\n\n` +
                    `📅 Datas Detectadas: \n[ ${diasFormatados} ]\n\n` +
                    `✅ Registros Válidos: ${dados.length}\n` +
                    `⚠️ Substituição: Dados anteriores destas datas serão APAGADOS.`;

        if (!confirm(msg)) {
            if(statusEl) statusEl.innerHTML = "Cancelado.";
            return;
        }

        if(statusEl) statusEl.innerHTML = `<span class="text-rose-600 font-bold">Limpando registros antigos...</span>`;

        // 1. Limpeza Segura (Por data literal YYYY-MM-DD)
        const { error: errDel } = await Sistema.supabase
            .from('assertividade')
            .delete()
            .in('data_referencia', dias);

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

// Inicialização
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Gestao.Importacao.Assertividade.init());
} else {
    Gestao.Importacao.Assertividade.init();
}