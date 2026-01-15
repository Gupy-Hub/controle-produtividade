window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

/**
 * MÓDULO DE IMPORTAÇÃO: ASSERTIVIDADE (NEXUS-CORE v7.0 - DEEP DIAGNOSTIC)
 * ------------------------------------------------------------------------
 * Correções:
 * 1. Busca dinâmica de cabeçalho (não assume que está na linha 1).
 * 2. Suporte a Data Serial do Excel (números) E Texto.
 * 3. Relatório detalhado de falha se nenhuma linha for importada.
 */
Gestao.Importacao.Assertividade = {
    init: function() {
        const inputId = 'input-csv-assertividade';
        const input = document.getElementById(inputId);
        
        if (input) {
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);
            
            newInput.addEventListener('change', (e) => {
                if(e.target.files.length > 0) this.processarExcel(e.target.files[0]);
            });
        }
    },

    processarExcel: function(file) {
        if (!file) return;

        const btn = document.getElementById('btn-importar-assert');
        const statusEl = document.getElementById('status-importacao-assert');
        
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';
        if(statusEl) statusEl.innerHTML = '<span class="text-blue-600 font-semibold">Analisando estrutura...</span>';

        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                // raw: true garante que datas venham como números ou strings originais, sem formatação "###" do Excel
                const workbook = XLSX.read(data, { type: 'array', cellDates: true }); 
                
                let targetSheetName = null;
                let targetRows = null;

                // 1. Procura a aba correta
                for (const sheetName of workbook.SheetNames) {
                    const sheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                    
                    if (rows.length > 0) {
                        // Varre as primeiras 20 linhas procurando cabeçalhos conhecidos
                        for(let i=0; i < Math.min(rows.length, 20); i++) {
                            const rowStr = rows[i].map(c => String(c).toLowerCase()).join(' ');
                            if (rowStr.includes('end_time') || rowStr.includes('end time')) {
                                targetSheetName = sheetName;
                                targetRows = rows;
                                console.log(`[NEXUS] Cabeçalho encontrado na aba '${sheetName}', linha ${i}`);
                                break;
                            }
                        }
                    }
                    if (targetSheetName) break;
                }

                if (!targetSheetName) {
                    throw new Error("Não encontrei a coluna 'end_time' em nenhuma aba do Excel. Verifique se o cabeçalho está correto.");
                }

                await this.mapearESalvar(targetRows, statusEl);

            } catch (error) {
                console.error("Erro Excel:", error);
                alert("ERRO CRÍTICO: " + error.message);
            } finally {
                if(btn) btn.innerHTML = '<i class="fas fa-file-upload"></i> Importar Excel';
                const input = document.getElementById('input-csv-assertividade');
                if(input) input.value = '';
                if(statusEl) setTimeout(() => statusEl.innerHTML = "", 8000);
            }
        };

        reader.readAsArrayBuffer(file);
    },

    mapearESalvar: async function(rows, statusEl) {
        // 1. Localizar a linha exata do cabeçalho
        let headerRowIndex = -1;
        let headers = [];

        for (let i = 0; i < Math.min(rows.length, 20); i++) {
            const row = rows[i].map(c => String(c).trim().toLowerCase());
            if (row.includes('end_time') || row.includes('end time') || row.includes('data')) {
                headerRowIndex = i;
                headers = row;
                break;
            }
        }

        if (headerRowIndex === -1) return alert("Erro: Cabeçalho não encontrado (end_time).");

        // 2. Mapear Colunas
        const idx = {
            endTime: headers.findIndex(h => h.includes('end_time') || h === 'data'),
            idAssistente: headers.findIndex(h => h.includes('id_assistente') || h === 'id' || h.includes('id ppc')),
            assistente: headers.lastIndexOf('assistente'), // Pega o último 'assistente' (geralmente o nome correto)
            auditora: headers.findIndex(h => h.includes('auditor')),
            docName: headers.findIndex(h => h.includes('doc_name') || h.includes('documento')),
            status: headers.findIndex(h => h === 'status'),
            obs: headers.findIndex(h => h.includes('obs')),
            ok: headers.findIndex(h => h === 'ok'),
            nok: headers.findIndex(h => h === 'nok'),
            pct: headers.findIndex(h => h.includes('assert') || h === '%'),
            dataAudit: headers.findIndex(h => h.includes('data da auditoria')),
            empresa: headers.findIndex(h => h === 'empresa'),
            companyId: headers.findIndex(h => h.includes('company'))
        };

        console.log("Índices mapeados:", idx); // Debug no Console (F12)

        // 3. Processar Linhas
        const validos = [];
        const diasEncontrados = new Set();
        let stats = { total: 0, erroData: 0, erroId: 0, exemploErro: '' };

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            stats.total++;

            // --- TRATAMENTO DE DATA ROBUSTO ---
            let rawDate = row[idx.endTime];
            let dataFinal = null;

            try {
                if (rawDate instanceof Date) {
                    // Se o XLSX já converteu para objeto Date
                    dataFinal = rawDate.toISOString().split('T')[0];
                } else if (typeof rawDate === 'number') {
                    // Data Serial do Excel (ex: 45632)
                    // (valor - 25569) * 86400 * 1000 ajusta para JS Epoch
                    const dateObj = new Date((rawDate - (25569)) * 86400 * 1000);
                    // Ajuste de fuso simples para garantir dia correto (adiciona 12h para evitar virada de dia na conversão)
                    dateObj.setHours(dateObj.getHours() + 12);
                    dataFinal = dateObj.toISOString().split('T')[0];
                } else if (typeof rawDate === 'string' && rawDate.trim().length > 0) {
                    // String: "2025-12-06T..." ou "06/12/2025"
                    let s = rawDate.trim();
                    if (s.includes('T')) {
                        dataFinal = s.split('T')[0];
                    } else if (s.includes('/')) {
                        const p = s.split('/'); // DD/MM/AAAA
                        if(p.length === 3) dataFinal = `${p[2]}-${p[1]}-${p[0]}`;
                    } else if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
                        dataFinal = s.substring(0, 10);
                    }
                }
            } catch (e) {
                console.warn("Erro ao converter data:", rawDate);
            }

            if (!dataFinal || !/^\d{4}-\d{2}-\d{2}$/.test(dataFinal)) {
                stats.erroData++;
                if(!stats.exemploErro) stats.exemploErro = `Linha ${i}: Data inválida ('${rawDate}')`;
                continue;
            }

            diasEncontrados.add(dataFinal);

            // --- TRATAMENTO DE ID ---
            let idRaw = row[idx.idAssistente];
            let idAssistente = idRaw ? parseInt(String(idRaw).replace(/\D/g, '')) : 0;

            if (!idAssistente) {
                stats.erroId++;
                continue;
            }

            // --- OUTROS CAMPOS ---
            let pctVal = (idx.pct > -1 && row[idx.pct]) ? String(row[idx.pct]).replace('%','').replace(',','.').trim() : '0';
            let pctFinal = isNaN(parseFloat(pctVal)) ? 0 : parseFloat(pctVal).toFixed(2);

            let dtAudit = null;
            if (idx.dataAudit > -1 && row[idx.dataAudit]) {
               // Lógica simplificada para data de auditoria
               let da = String(row[idx.dataAudit]).trim();
               if(da.length >= 10) dtAudit = da.substring(0, 10).replace(/\//g, '-'); 
               // (Aprimorar se necessário, mas foco é end_time)
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
                num_campos: 0, 
                porcentagem: pctFinal,
                data_referencia: dataFinal,
                data_auditoria: dtAudit,
                empresa_nome: (idx.empresa > -1 ? String(row[idx.empresa]||'') : '').trim(),
                empresa_id: (idx.companyId > -1) ? (parseInt(row[idx.companyId]) || 0) : 0
            });
        }

        // --- RELATÓRIO DE ERRO ---
        if (validos.length === 0) {
            if(statusEl) statusEl.innerHTML = "";
            let msg = `⚠️ Nenhuma linha importada!\n\n`;
            msg += `Total linhas analisadas: ${stats.total}\n`;
            msg += `Falha na Data (end_time): ${stats.erroData} linhas\n`;
            msg += `Falha no ID: ${stats.erroId} linhas\n\n`;
            if (stats.exemploErro) msg += `Exemplo do problema: ${stats.exemploErro}`;
            
            alert(msg);
            return;
        }

        await this.salvarNoBanco(validos, Array.from(diasEncontrados), statusEl);
    },

    salvarNoBanco: async function(dados, dias, statusEl) {
        dias.sort();
        const diasFormatados = dias.map(d => d.split('-').reverse().join('/')).join(', ');
        
        const msg = `Confirmação de Importação:\n\n` +
                    `📅 Dias: \n[ ${diasFormatados} ]\n\n` +
                    `✅ Registros: ${dados.length}\n` +
                    `⚠️ Substituição: Dados antigos destas datas serão apagados.`;

        if (!confirm(msg)) {
            if(statusEl) statusEl.innerHTML = "Cancelado.";
            return;
        }

        if(statusEl) statusEl.innerHTML = `<span class="text-rose-600 font-bold">Limpando dados antigos...</span>`;

        const { error: errDel } = await Sistema.supabase
            .from('assertividade')
            .delete()
            .in('data_referencia', dias);

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
                statusEl.innerHTML = `<span class="text-orange-600 font-bold">Salvando... ${pct}%</span>`;
            }
            const { error } = await Sistema.supabase.from('assertividade').insert(lote);
            if (error) {
                alert(`Erro lote: ${error.message}`);
                return;
            }
            inseridos += lote.length;
        }

        alert(`Sucesso! ${inseridos} registros salvos.`);
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