window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

/**
 * MÓDULO DE IMPORTAÇÃO: ASSERTIVIDADE (REWRITE v12.0 - STRICT END_TIME)
 * ---------------------------------------------------------------------
 * Missão: Importação rigorosa baseada EXCLUSIVAMENTE na coluna 'end_time'.
 * * Estratégia:
 * 1. Análise de Texto Puro: Não confia no objeto Date() do JS (evita bugs de fuso).
 * 2. Filtro de Entrada: Linha sem 'end_time' = Lixo (Descartada).
 * 3. Mapeamento Híbrido: Suporta colunas novas e legadas para preencher o Dashboard.
 */
Gestao.Importacao.Assertividade = {
    init: function() {
        // Reinicializa input para evitar disparos duplos
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

    // --- O CÉREBRO DA DATA ---
    // Converte qualquer formato (ISO, Excel, BR) para YYYY-MM-DD
    sanitizarData: function(valorRaw) {
        if (!valorRaw || typeof valorRaw !== 'string') return null;
        const str = valorRaw.trim();
        if (str === '' || str === 'undefined' || str === 'null') return null;

        try {
            let ano, mes, dia;

            // PADRÃO 1: ISO / Banco (ex: "2025-12-01T..." ou "2025-12-01")
            if (str.includes('-')) {
                // Pega apenas a parte da data antes de qualquer 'T' ou espaço
                const clean = str.split('T')[0].split(' ')[0]; 
                const partes = clean.split('-');
                if (partes.length >= 3) {
                    ano = partes[0];
                    mes = partes[1];
                    dia = partes[2];
                }
            }
            // PADRÃO 2: Brasileiro / Excel (ex: "01/12/2025" ou "1/12/2025")
            else if (str.includes('/')) {
                const clean = str.split(' ')[0]; // Remove hora se existir
                const partes = clean.split('/');
                if (partes.length >= 3) {
                    dia = partes[0];
                    mes = partes[1];
                    ano = partes[2];
                }
            }

            // Se falhou em extrair, desiste
            if (!ano || !mes || !dia) return null;

            // Normalização (Garante 4 dígitos no ano e 2 em dia/mês)
            if (ano.length === 2) ano = '20' + ano;
            if (mes.length === 1) mes = '0' + mes;
            if (dia.length === 1) dia = '0' + dia;

            // Validação Final de Formato
            const dataFinal = `${ano}-${mes}-${dia}`;
            return /^\d{4}-\d{2}-\d{2}$/.test(dataFinal) ? dataFinal : null;

        } catch (e) {
            return null;
        }
    },

    processarCSV: function(file) {
        if (!file) return;

        const btn = document.getElementById('btn-importar-assert');
        const statusEl = document.getElementById('status-importacao-assert');
        
        // Feedback Visual
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';
        if(statusEl) statusEl.innerHTML = '<span class="text-blue-600 font-bold">Analisando end_time...</span>';

        Papa.parse(file, {
            header: false, // Mapeamento manual para controle total
            skipEmptyLines: 'greedy', // Remove linhas vazias automaticamente
            escapeChar: '\\', // Importante para aspas dentro de textos
            encoding: "UTF-8",
            complete: async (results) => {
                try {
                    await this.analisarLinhas(results.data, statusEl);
                } catch (error) {
                    console.error("Erro Fatal:", error);
                    alert("Erro no processamento: " + error.message);
                } finally {
                    if(btn) btn.innerHTML = '<i class="fas fa-file-upload"></i> Importar CSV';
                    const input = document.getElementById('input-csv-assertividade');
                    if(input) input.value = '';
                    if(statusEl) setTimeout(() => statusEl.innerHTML = "", 5000);
                }
            },
            error: (err) => {
                alert("Falha na leitura do arquivo: " + err.message);
            }
        });
    },

    analisarLinhas: async function(rows, statusEl) {
        if (!rows || rows.length < 2) return alert("Arquivo vazio ou cabeçalho ausente.");

        // 1. Descobrir colunas (Normaliza para minúsculo e sem aspas)
        const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/"/g, ''));
        
        // 2. Mapa de Índices (Onde está cada dado?)
        const idx = {
            endTime: headers.findIndex(h => h.includes('end_time')), // OBRIGATÓRIO
            
            // Prioriza 'id_assistente' (coluna 18), fallback para outros IDs
            idAssistente: headers.indexOf('id_assistente') !== -1 
                ? headers.indexOf('id_assistente') 
                : headers.findIndex(h => h.includes('id_assistente') || h === 'id' || h.includes('id ppc')),
            
            assistente: headers.lastIndexOf('assistente'), 
            
            // Auditora (Evita pegar coluna de data)
            auditora: headers.findIndex(h => h.includes('auditor') && !h.includes('data')),
            
            // Metadados
            docName: headers.findIndex(h => h.includes('doc_name') || h.includes('documento')),
            status: headers.findIndex(h => h === 'status'),
            obs: headers.findIndex(h => h.includes('obs') || h.includes('apontamentos')),
            ok: headers.findIndex(h => h === 'ok'),
            nok: headers.findIndex(h => h === 'nok'),
            pct: headers.findIndex(h => h.includes('assert') || h === '%'),
            dataAudit: headers.findIndex(h => h.includes('data da auditoria')),
            empresa: headers.findIndex(h => h.includes('empresa')), // Flexibilizado para pegar 'empresa' ou 'nome empresa'
            companyId: headers.findIndex(h => h.includes('company_id') || h.includes('company')),
            campos: headers.findIndex(h => h.includes('campos') || h.includes('nº campos'))
        };

        // Validação Crítica
        if (idx.endTime === -1) return alert("ERRO FATAL: Coluna 'end_time' não encontrada no CSV.");
        if (idx.idAssistente === -1) return alert("ERRO FATAL: Coluna 'id_assistente' não encontrada.");

        const dadosValidos = [];
        const diasEncontrados = new Set();
        let stats = { total: 0, descartadosSemData: 0, descartadosSemID: 0 };

        // 3. Varredura (Começa da linha 1)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;
            stats.total++;

            // --- FILTRO 1: DATA (END_TIME) ---
            const dataString = this.sanitizarData(row[idx.endTime]);
            
            if (!dataString) {
                stats.descartadosSemData++;
                continue; // Linha sumariamente excluída
            }
            diasEncontrados.add(dataString);

            // --- FILTRO 2: ID VÁLIDO ---
            let idRaw = row[idx.idAssistente];
            let idAssistente = idRaw ? parseInt(String(idRaw).replace(/\D/g, '')) : 0;
            if (!idAssistente) {
                stats.descartadosSemID++;
                continue; // Sem ID, sem registro
            }

            // --- EXTRAÇÃO DE DADOS ---
            // Porcentagem (Trata vírgula e %)
            let pctFinal = 0;
            if (idx.pct > -1 && row[idx.pct]) {
                let p = String(row[idx.pct]).replace('%','').replace(',','.').trim();
                pctFinal = isNaN(parseFloat(p)) ? 0 : parseFloat(p).toFixed(2);
            }

            // Outros campos com sanitização básica
            let dtAudit = idx.dataAudit > -1 ? this.sanitizarData(row[idx.dataAudit]) : null;
            let numCampos = (idx.campos > -1 && row[idx.campos]) ? (parseInt(row[idx.campos]) || 0) : 0;
            let empresaNome = (idx.empresa > -1 ? String(row[idx.empresa]||'') : '').trim();
            let obsTexto = (idx.obs > -1 ? String(row[idx.obs]||'') : '').trim();
            let companyId = (idx.companyId > -1) ? (parseInt(row[idx.companyId]) || 0) : 0;

            dadosValidos.push({
                // Chaves para RPC (backend)
                usuario_id: idAssistente,
                nome_assistente: (idx.assistente > -1 ? String(row[idx.assistente]||'') : '').trim(),
                nome_auditora_raw: (idx.auditora > -1 ? String(row[idx.auditora]||'') : '').trim(),
                nome_documento: (idx.docName > -1 ? String(row[idx.docName]||'') : '').trim(),
                status: (idx.status > -1 ? String(row[idx.status]||'') : '').toUpperCase().trim(),
                observacao: obsTexto,
                qtd_ok: (idx.ok > -1) ? (parseInt(row[idx.ok]) || 0) : 0,
                qtd_nok: (idx.nok > -1) ? (parseInt(row[idx.nok]) || 0) : 0,
                num_campos: numCampos,
                porcentagem: pctFinal,
                data_referencia: dataString, // A data limpa e validada
                data_auditoria: dtAudit,
                empresa_nome: empresaNome,
                empresa_id: companyId
            });
        }

        if (dadosValidos.length === 0) {
            return alert(`Nenhum dado válido encontrado.\n\n` + 
                         `Descartados (Sem Data/end_time): ${stats.descartadosSemData}\n` +
                         `Descartados (Sem ID): ${stats.descartadosSemID}`);
        }

        await this.executarTransacaoSegura(dadosValidos, Array.from(diasEncontrados), statusEl);
    },

    executarTransacaoSegura: async function(dados, dias, statusEl) {
        dias.sort();
        const diasFormatados = dias.map(d => d.split('-').reverse().join('/')).join(', ');
        
        const msg = `Resumo da Importação:\n\n` +
                    `📅 Periodo Identificado: \n[ ${diasFormatados} ]\n\n` +
                    `✅ Registros Válidos: ${dados.length}\n` +
                    `⚠️ Atenção: Os dados destes dias serão APAGADOS e REESCRITOS.`;

        if (!confirm(msg)) {
            if(statusEl) statusEl.innerHTML = "Cancelado pelo usuário.";
            return;
        }

        if(statusEl) statusEl.innerHTML = `<span class="text-rose-600 font-bold">Limpando dados antigos...</span>`;

        // 1. Limpeza via RPC (Blindado)
        const { error: errDel } = await Sistema.supabase
            .rpc('limpar_assertividade_dias', { dias: dias });

        if (errDel) {
            console.error(errDel);
            alert("Erro ao limpar dados antigos: " + errDel.message);
            if(statusEl) statusEl.innerHTML = "";
            return;
        }

        // 2. Inserção em Lote via RPC (Blindado)
        const BATCH_SIZE = 500;
        let inseridos = 0;

        for (let i = 0; i < dados.length; i += BATCH_SIZE) {
            const lote = dados.slice(i, i + BATCH_SIZE);
            if(statusEl) {
                const pct = Math.round(((i + lote.length) / dados.length) * 100);
                statusEl.innerHTML = `<span class="text-orange-600 font-bold">Gravando... ${pct}%</span>`;
            }

            const { error } = await Sistema.supabase
                .rpc('importar_assertividade_lote', { dados: lote });

            if (error) {
                alert(`Erro no lote ${i}: ${error.message}`);
                return;
            }
            inseridos += lote.length;
        }

        alert(`Sucesso! ${inseridos} registros importados.`);
        if(statusEl) statusEl.innerHTML = '<span class="text-emerald-600 font-bold">Importação Concluída!</span>';
        
        // Atualiza a tabela se estiver na tela
        if(Gestao.Assertividade && typeof Gestao.Assertividade.buscarDados === 'function') {
            Gestao.Assertividade.buscarDados();
        }
    }
};

// Inicialização Automática
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Gestao.Importacao.Assertividade.init());
} else {
    Gestao.Importacao.Assertividade.init();
}