window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    
    processarArquivo: function(input) {
        const arquivo = input.files[0];
        if (!arquivo) return;

        const statusEl = document.getElementById('status-importacao');
        statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo base de dados...</span>`;

        Papa.parse(arquivo, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            transformHeader: function(header) {
                return header.trim();
            },
            complete: async (results) => {
                if (results.data.length === 0) {
                    alert("Arquivo vazio ou ilegível.");
                    statusEl.innerText = "";
                    return;
                }
                await this.enviarParaBanco(results.data);
                input.value = ""; 
            },
            error: (err) => {
                console.error("Erro CSV:", err);
                alert("Erro na leitura: " + err.message);
                statusEl.innerText = "Erro.";
            }
        });
    },

    enviarParaBanco: async function(linhas) {
        const statusEl = document.getElementById('status-importacao');
        let sucesso = 0;
        let erros = 0;
        const TAMANHO_LOTE = 100; // Aumentei o lote para ir mais rápido com 200k linhas

        const dadosFormatados = linhas.map(linha => {
            // LÓGICA DE DATA: Prioridade para 'Data da Auditoria', fallback para 'end_time'
            // O 'end_time' é nossa base segura (ex: 2025-12-02T12:17:04.332Z)
            let valData = linha['Data da Auditoria'] || linha['Data'] || linha['data_auditoria'];
            let dataOrigem = 'AUDITORIA';

            // Se não tiver data de auditoria, usa o end_time
            if (!valData || valData.trim() === '') {
                valData = linha['end_time'];
                dataOrigem = 'SISTEMA';
            }
            
            // Se ainda assim não tiver data, descarta
            if (!valData) return null;

            // TRATAMENTO DE FORMATOS DE DATA
            let dataFormatada = null;
            
            // 1. Formato ISO do end_time (YYYY-MM-DDTHH:mm:ss...)
            if (valData.includes('T')) {
                dataFormatada = valData.split('T')[0];
            } 
            // 2. Formato Brasileiro (DD/MM/YYYY)
            else if (valData.includes('/')) {
                const partes = valData.split('/');
                if (partes.length === 3) dataFormatada = `${partes[2]}-${partes[1]}-${partes[0]}`;
            } 
            // 3. Formato Padrão ISO Simples (YYYY-MM-DD)
            else if (valData.includes('-')) {
                dataFormatada = valData;
            }

            if (!dataFormatada) return null;

            // Tratamento de Números
            const campos = parseInt(linha['nº Campos']) || 0;
            const ok = parseInt(linha['Ok']) || 0;
            const nok = parseInt(linha['Nok']) || 0;

            return {
                data_auditoria: dataFormatada,
                company_id: linha['Company_id'] || null,
                empresa: linha['Empresa'] || linha['Nome da PPC'] || 'Desconhecida',
                assistente: linha['Assistente'] || linha['id_assistente'],
                doc_name: linha['doc_name'] || linha['DOCUMENTO'] || linha['nome_documento'],
                status: linha['STATUS'] || 'PENDENTE',
                // Adiciona aviso na obs se a data foi inferida pelo sistema
                obs: (linha['Apontamentos/obs'] || linha['obs'] || '') + (dataOrigem === 'SISTEMA' ? ' [Data via System]' : ''),
                campos: campos,
                ok: ok,
                nok: nok,
                porcentagem: linha['% Assert'] || '0%',
                auditora: linha['Auditora'] || 'Sistema'
            };
        }).filter(item => item !== null);

        const total = dadosFormatados.length;
        
        if (total === 0) {
            alert("Nenhum registro válido encontrado (nem Data da Auditoria, nem end_time).");
            statusEl.innerText = "Falha: Dados insuficientes.";
            return;
        }

        statusEl.innerHTML = `<span class="text-orange-500 font-bold">Importando ${total.toLocaleString('pt-BR')} registros... (Pode demorar)</span>`;

        // Envio em Lotes
        for (let i = 0; i < total; i += TAMANHO_LOTE) {
            const lote = dadosFormatados.slice(i, i + TAMANHO_LOTE);
            
            // Atualiza status a cada 5 lotes para não piscar muito
            if (i % (TAMANHO_LOTE * 5) === 0) {
                statusEl.innerText = `Processando... ${Math.round((i/total)*100)}% (${i.toLocaleString('pt-BR')}/${total.toLocaleString('pt-BR')})`;
            }
            
            const { error } = await Sistema.supabase
                .from('assertividade')
                .insert(lote);

            if (error) {
                console.error("Erro lote:", error);
                erros += lote.length;
            } else {
                sucesso += lote.length;
            }
        }

        // Relatório Final
        if (erros > 0) {
            statusEl.innerHTML = `<span class="text-red-600 font-bold">Concluído com ressalvas. Sucesso: ${sucesso} | Falhas: ${erros}</span>`;
        } else {
            statusEl.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fas fa-check"></i> Importação Finalizada: ${sucesso.toLocaleString('pt-BR')} registros.</span>`;
            if(Gestao && Gestao.Assertividade) Gestao.Assertividade.carregar();
            alert(`Processo concluído!\n${sucesso.toLocaleString('pt-BR')} registros importados com sucesso.`);
        }
    }
};