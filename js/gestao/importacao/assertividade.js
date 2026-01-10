window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Assertividade = {
    executar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        // --- 1. Feedback Visual (Botão) ---
        const btnLabel = input.parentElement;
        const originalHtml = btnLabel.innerHTML;
        const atualizarStatus = (texto) => {
            btnLabel.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> ${texto}`;
        };
        
        btnLabel.classList.add('opacity-50', 'cursor-not-allowed');
        atualizarStatus("Lendo arquivo...");

        // Pequeno delay para a interface atualizar
        await new Promise(r => setTimeout(r, 50));

        try {
            // --- 2. Carrega dados Auxiliares do Banco ---
            // Precisamos dos Usuários para validar e das Empresas para o nome oficial
            const { data: usersData } = await Sistema.supabase.from('usuarios').select('id, nome');
            const { data: empData } = await Sistema.supabase.from('empresas').select('id, nome, subdominio');

            // Mapa de Usuários (Busca rápida por ID e Nome)
            const mapUsuariosID = new Map();
            const mapUsuariosNome = new Map();
            usersData.forEach(u => {
                mapUsuariosID.set(u.id, u.id);
                mapUsuariosNome.set(this.normalizar(u.nome), u.id);
            });

            // Mapa de Empresas (Nome -> {id, nome})
            // Usado como fallback caso a planilha não tenha o ID da empresa em alguma linha
            const mapEmpresas = new Map();
            empData.forEach(e => {
                const info = { id: e.id, nome: e.nome };
                mapEmpresas.set(this.normalizar(e.nome), info);
                if(e.subdominio) mapEmpresas.set(this.normalizar(e.subdominio), info);
            });

            // --- 3. Leitura do Arquivo (Excel ou CSV) ---
            const linhas = await Gestao.lerArquivo(file);
            
            atualizarStatus(`Processando ${linhas.length} linhas...`);
            await new Promise(r => setTimeout(r, 10));

            const inserts = [];
            
            // Variáveis de Relatório
            let stats = { total: linhas.length, sucesso: 0, ignorados: 0 };
            const logNaoEncontrados = new Set(); 

            // --- 4. Loop de Processamento (Linha a Linha) ---
            for (const row of linhas) {
                const c = {};
                // Normaliza as chaves (remove espaços e acentos dos cabeçalhos)
                // Ex: "Company_id" vira "companyid", "ID Assistente" vira "idassistente"
                for (const k in row) c[this.normalizarKey(k)] = row[k];

                // A. IDENTIFICAÇÃO DO USUÁRIO
                // Prioridade: ID direto > Nome
                let idPlanilha = parseInt(c['idassistente'] || c['id'] || c['idusuario'] || 0);
                let nomePlanilha = c['assistente'] || c['usuario'] || c['nome'] || 'Sem Nome';
                let usuarioId = null;

                if (idPlanilha && mapUsuariosID.has(idPlanilha)) {
                    usuarioId = idPlanilha;
                } else {
                    if (nomePlanilha) usuarioId = mapUsuariosNome.get(this.normalizar(nomePlanilha));
                }

                // Se não achou usuário, pula e loga o erro
                if (!usuarioId) {
                    stats.ignorados++;
                    if(nomePlanilha !== 'Sem Nome') {
                        logNaoEncontrados.add(`Assistente não cadastrado: "${nomePlanilha}" (ID CSV: ${idPlanilha || 'N/A'})`);
                    }
                    continue; 
                }

                // B. IDENTIFICAÇÃO DA EMPRESA (O Ponto Principal)
                const nomeEmpresaRaw = c['empresa'] || '';
                
                // 1. Tenta pegar o ID direto da coluna 'Company_id' (normalizada para 'companyid')
                let empresaId = parseInt(c['companyid'] || c['company_id'] || c['idempresa'] || 0);
                
                let empresaOficialNome = nomeEmpresaRaw;

                // 2. Se não veio ID na planilha, tenta achar pelo nome no cadastro do sistema
                if (!empresaId) {
                    const match = mapEmpresas.get(this.normalizar(nomeEmpresaRaw));
                    if (match) {
                        empresaId = match.id;
                        empresaOficialNome = match.nome; // Usa o nome bonitinho do cadastro
                    }
                }

                // Garante que se for 0 ou NaN, vire null para o banco
                if (!empresaId) empresaId = null;

                // C. TRATAMENTO DE DATA
                let dataRef = null;
                let horaRef = null;
                // Tenta pegar data/hora completa (end_time) ou só data (datadaauditoria)
                const rawDate = c['endtime'] || c['datadaauditoria'] || c['data'] || c['date'];
                
                if (rawDate) {
                    if (typeof rawDate === 'object') {
                        // Se o Excel já devolveu objeto Date
                        dataRef = rawDate.toISOString().split('T')[0];
                        horaRef = rawDate.toLocaleTimeString('pt-BR');
                    } else {
                        // Se veio String
                        try {
                            const dObj = new Date(rawDate);
                            if (!isNaN(dObj)) {
                                dataRef = dObj.toISOString().split('T')[0];
                                horaRef = dObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
                            }
                        } catch(e) {}
                    }
                }

                if (!dataRef) {
                    stats.ignorados++; // Sem data não dá pra salvar
                    continue;
                }

                // D. PREPARAÇÃO DO OBJETO PARA O BANCO
                inserts.push({
                    usuario_id: usuarioId,
                    data_referencia: dataRef,
                    hora: horaRef,
                    empresa: empresaOficialNome,
                    empresa_id: empresaId, // Aqui vai o ID recuperado da planilha
                    
                    nome_documento: c['docname'] || c['documento'] || '',
                    status: c['status'] || '',
                    observacao: c['apontamentosobs'] || c['obs'] || c['apontamentos'] || '',
                    
                    // Converte para Inteiro, se falhar vira 0
                    num_campos: parseInt(c['ncampos'] || c['numerocampos'] || 0),
                    qtd_ok: parseInt(c['ok'] || 0),
                    nok: parseInt(c['nok'] || 0),
                    
                    // Texto (ex: "98%")
                    assertividade: c['assert'] || c['assertividade'] || c['%assert'] || '',
                    
                    auditora: c['auditora'] || '',
                    quantidade: 1, 
                    fator: 1
                });
            }

            // --- 5. Envio em Lotes Paralelos (Alta Performance) ---
            if (inserts.length > 0) {
                const totalRegistros = inserts.length;
                const batchSize = 2000; // Tamanho do lote
                const lotes = [];

                // Divide o array gigante em fatias
                for (let i = 0; i < totalRegistros; i += batchSize) {
                    lotes.push(inserts.slice(i, i + batchSize));
                }

                let processados = 0;
                const limiteConcorrencia = 5; // Quantos lotes envia ao mesmo tempo
                
                // Envia os lotes
                for (let i = 0; i < lotes.length; i += limiteConcorrencia) {
                    const chunk = lotes.slice(i, i + limiteConcorrencia);
                    
                    // Cria as promessas de envio
                    const promessas = chunk.map(async (lote) => {
                        const { error } = await Sistema.supabase.from('producao').insert(lote);
                        if (error) throw error;
                    });
                    
                    // Espera esse grupo terminar antes de mandar o próximo (evita travar o navegador)
                    await Promise.all(promessas);
                    
                    processados += chunk.reduce((acc, curr) => acc + curr.length, 0);
                    const pct = Math.round((processados / totalRegistros) * 100);
                    atualizarStatus(`Salvando... ${pct}%`);
                }

                stats.sucesso = processados;
                
                // Mensagem Final
                let msg = `Importação Concluída!\n✅ Registros salvos: ${stats.sucesso}`;
                
                if (logNaoEncontrados.size > 0) {
                    msg += `\n⚠️ Atenção: ${logNaoEncontrados.size} assistentes da planilha não foram encontrados no sistema.\nUm arquivo de erro será baixado.`;
                    this.baixarLog(logNaoEncontrados);
                } else if (stats.ignorados > 0) {
                    msg += `\n⚠️ Alguns registros foram ignorados por falta de data.`;
                }
                
                alert(msg);

                // Atualiza a tabela na tela
                if (Gestao.Assertividade) Gestao.Assertividade.carregar();
            } else {
                if (logNaoEncontrados.size > 0) {
                    alert(`Nenhum registro foi salvo.\n${logNaoEncontrados.size} assistentes não foram encontrados.\nBaixando lista de erros...`);
                    this.baixarLog(logNaoEncontrados);
                } else {
                    alert("A planilha parece estar vazia ou não consegui ler as colunas principais (ID Assistente, Company ID, End Time).");
                }
            }

        } catch (e) {
            console.error(e);
            alert("Erro durante a importação: " + e.message);
        } finally {
            // Restaura o botão
            btnLabel.innerHTML = originalHtml;
            btnLabel.classList.remove('opacity-50', 'cursor-not-allowed');
            input.value = "";
        }
    },

    // --- Função para gerar TXT de Erros ---
    baixarLog: function(setErros) {
        const lista = Array.from(setErros).join('\n');
        const conteudo = `RELATÓRIO DE ERROS DE IMPORTAÇÃO - ${new Date().toLocaleString()}\n\nOs seguintes assistentes constam na planilha mas NÃO existem no cadastro de Usuários:\n\n${lista}\n\nDICA: Cadastre-os na aba 'Usuários' e tente importar novamente.`;
        
        const blob = new Blob([conteudo], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `erros_importacao_${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    },

    // --- Utilitários de Texto ---
    normalizar: function(str) {
        return String(str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/ /g, '');
    },

    normalizarKey: function(k) {
        // Remove tudo que não for letra ou numero para garantir match das colunas
        // Ex: "Company_id" -> "companyid", "nº Campos" -> "ncampos"
        return String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    }
};