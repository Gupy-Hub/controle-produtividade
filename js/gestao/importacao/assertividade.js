window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    
    processarArquivo: function(input) {
        const arquivo = input.files[0];
        if (!arquivo) return;

        const statusEl = document.getElementById('status-importacao');
        statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Analisando arquivo...</span>`;

        Papa.parse(arquivo, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            transformHeader: function(header) {
                // Remove espaços extras e aspas que possam atrapalhar a leitura
                return header.trim().replace(/"/g, '');
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
        const TAMANHO_LOTE = 100;

        const dadosFormatados = linhas.map(linha => {
            // 1. LÓGICA DE DATA (Igual à versão anterior)
            let valData = linha['Data da Auditoria'] || linha['Data'] || linha['data_auditoria'];
            let dataOrigem = 'AUDITORIA';

            if (!valData || valData.trim() === '') {
                valData = linha['end_time'];
                dataOrigem = 'SISTEMA';
            }
            
            if (!valData) return null;

            let dataFormatada = null;
            if (valData.includes('T')) dataFormatada = valData.split('T')[0];
            else if (valData.includes('/')) {
                const partes = valData.split('/');
                if (partes.length === 3) dataFormatada = `${partes[2]}-${partes[1]}-${partes[0]}`;
            } 
            else if (valData.includes('-')) dataFormatada = valData;

            if (!dataFormatada) return null;

            // 2. LÓGICA DE NOME DA EMPRESA (Melhorada)
            // Tenta várias colunas possíveis
            let nomeEmpresa = linha['Empresa'] || 
                              linha['empresa'] || 
                              linha['Nome da PPC'] || 
                              linha['Nome da PPC'] || // Caso tenha espaço
                              linha['Company Name'];

            const idEmpresa = linha['Company_id'] || linha['company_id'] || null;

            // Se não achou nome, mas tem ID, usa o ID como nome provisório
            if ((!nomeEmpresa || nomeEmpresa.trim() === '') && idEmpresa) {
                nomeEmpresa = `Empresa ID: ${idEmpresa}`;
            } else if (!nomeEmpresa) {
                nomeEmpresa = 'Desconhecida';
                // Log para você saber qual linha deu problema (abra o F12 no navegador se precisar ver)
                console.warn('Empresa não identificada na linha:', linha);
            }

            // Tratamento de Números
            const campos = parseInt(linha['nº Campos']) || 0;
            const ok = parseInt(linha['Ok']) || 0;
            const nok = parseInt(linha['Nok']) || 0;

            return {
                data_auditoria: dataFormatada,
                company_id: idEmpresa,
                empresa: nomeEmpresa,
                assistente: linha['Assistente'] || linha['id_assistente'],
                doc_name: linha['doc_name'] || linha['DOCUMENTO'] || linha['nome_documento'],
                status: linha['STATUS'] || 'PENDENTE',
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
            alert("Nenhum registro válido encontrado.");
            statusEl.innerText = "Falha: Dados insuficientes.";
            return;
        }

        statusEl.innerHTML = `<span class="text-orange-500 font-bold">Importando ${total.toLocaleString('pt-BR')} registros...</span>`;

        for (let i = 0; i < total; i += TAMANHO_LOTE) {
            const lote = dadosFormatados.slice(i, i + TAMANHO_LOTE);
            
            if (i % (TAMANHO_LOTE * 5) === 0) {
                statusEl.innerText = `Processando... ${Math.round((i/total)*100)}%`;
            }
            
            const { error } = await Sistema.supabase.from('assertividade').insert(lote);

            if (error) {
                console.error("Erro lote:", error);
                erros += lote.length;
            } else {
                sucesso += lote.length;
            }
        }

        if (erros > 0) {
            statusEl.innerHTML = `<span class="text-red-600 font-bold">Sucesso: ${sucesso} | Falhas: ${erros}</span>`;
        } else {
            statusEl.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fas fa-check"></i> Importação Finalizada: ${sucesso.toLocaleString('pt-BR')} registros.</span>`;
            if(Gestao && Gestao.Assertividade) Gestao.Assertividade.carregar();
            alert(`Processo concluído!\n${sucesso.toLocaleString('pt-BR')} registros salvos.`);
        }
    }
};