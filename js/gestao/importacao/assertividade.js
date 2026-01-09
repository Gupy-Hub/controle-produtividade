window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Assertividade = {
    executar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        // Feedback Visual
        const btnLabel = input.parentElement;
        const originalHtml = btnLabel.innerHTML;
        const atualizarStatus = (texto) => {
            btnLabel.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> ${texto}`;
        };
        
        btnLabel.classList.add('opacity-50', 'cursor-not-allowed');
        atualizarStatus("Lendo arquivo...");

        // Delay para UI renderizar
        await new Promise(r => setTimeout(r, 50));

        try {
            // 1. Carrega dados do Banco
            const { data: usersData } = await Sistema.supabase.from('usuarios').select('id, nome');
            const { data: empData } = await Sistema.supabase.from('empresas').select('id, nome, subdominio');

            // Mapas O(1)
            const mapUsuariosID = new Map();
            const mapUsuariosNome = new Map();
            usersData.forEach(u => {
                mapUsuariosID.set(u.id, u.id);
                mapUsuariosNome.set(this.normalizar(u.nome), u.id);
            });

            const mapEmpresas = new Map();
            empData.forEach(e => {
                const nomeOficial = e.nome;
                mapEmpresas.set(this.normalizar(e.nome), nomeOficial);
                if(e.subdominio) mapEmpresas.set(this.normalizar(e.subdominio), nomeOficial);
            });

            // 2. Leitura do Arquivo
            const linhas = await Gestao.lerArquivo(file);
            
            atualizarStatus(`Processando ${linhas.length} linhas...`);
            await new Promise(r => setTimeout(r, 10));

            const inserts = [];
            
            // Relatório de Execução
            let stats = { total: linhas.length, sucesso: 0, ignorados: 0 };
            
            // Lista para o arquivo de Log (Set para evitar repetição do mesmo erro 1000x)
            const logNaoEncontrados = new Set(); 

            // 3. Processamento
            for (const row of linhas) {
                const c = {};
                for (const k in row) c[this.normalizarKey(k)] = row[k];

                // --- IDENTIFICAÇÃO DO USUÁRIO ---
                let idPlanilha = parseInt(c['idassistente'] || c['id'] || c['idusuario'] || 0);
                let nomePlanilha = c['assistente'] || c['usuario'] || c['nome'] || 'Sem Nome';
                let usuarioId = null;

                // Tenta por ID
                if (idPlanilha && mapUsuariosID.has(idPlanilha)) {
                    usuarioId = idPlanilha;
                } else {
                    // Tenta por Nome
                    if (nomePlanilha) usuarioId = mapUsuariosNome.get(this.normalizar(nomePlanilha));
                }

                if (!usuarioId) {
                    stats.ignorados++;
                    // Adiciona ao log de erros (Nome e ID que tentou usar)
                    logNaoEncontrados.add(`Assistente não cadastrado: "${nomePlanilha}" (ID Planilha: ${idPlanilha || 'N/A'})`);
                    continue; 
                }

                // --- EMPRESA ---
                const nomeEmpresaRaw = c['empresa'] || '';
                const empresaOficial = mapEmpresas.get(this.normalizar(nomeEmpresaRaw)) || nomeEmpresaRaw;

                // --- DATA ---
                let dataRef = null;
                let horaRef = null;
                const rawDate = c['endtime'] || c['data'] || c['date'] || c['datadaauditoria'];
                
                if (rawDate) {
                    if (typeof rawDate === 'object') {
                        dataRef = rawDate.toISOString().split('T')[0];
                        horaRef = rawDate.toLocaleTimeString('pt-BR');
                    } else {
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
                    stats.ignorados++;
                    // Opcional: Adicionar erro de data ao log também
                    // logNaoEncontrados.add(`Data inválida na linha do assistente: ${nomePlanilha}`);
                    continue;
                }

                // Push
                inserts.push({
                    usuario_id: usuarioId,
                    data_referencia: dataRef,
                    hora: horaRef,
                    empresa: empresaOficial,
                    nome_documento: c['docname'] || c['documento'] || '',
                    status: c['status'] || '',
                    observacao: c['apontamentosobs'] || c['obs'] || c['apontamentos'] || '',
                    num_campos: parseInt(c['ncampos'] || c['numerocampos'] || 0),
                    qtd_ok: parseInt(c['ok'] || 0),
                    nok: parseInt(c['nok'] || 0),
                    assertividade: c['%assert'] || c['assertividade'] || '',
                    auditora: c['auditora'] || '',
                    quantidade: 1, 
                    fator: 1
                });
            }

            // 4. Envio ao Banco (Paralelo)
            if (inserts.length > 0) {
                const totalRegistros = inserts.length;
                const batchSize = 2000;
                const lotes = [];

                for (let i = 0; i < totalRegistros; i += batchSize) {
                    lotes.push(inserts.slice(i, i + batchSize));
                }

                let processados = 0;
                const limiteConcorrencia = 5;
                
                for (let i = 0; i < lotes.length; i += limiteConcorrencia) {
                    const chunk = lotes.slice(i, i + limiteConcorrencia);
                    const promessas = chunk.map(lote => Sistema.supabase.from('producao').insert(lote));
                    
                    const resultados = await Promise.all(promessas);
                    resultados.forEach(res => { if (res.error) throw res.error; });

                    processados += chunk.reduce((acc, curr) => acc + curr.length, 0);
                    
                    const pct = Math.round((processados / totalRegistros) * 100);
                    atualizarStatus(`Salvando... ${pct}%`);
                }

                stats.sucesso = processados;
                
                // Mensagem Final
                let msg = `Finalizado!\n\n✅ Sucesso: ${stats.sucesso}`;
                
                if (logNaoEncontrados.size > 0) {
                    msg += `\n⚠️ Erros: ${logNaoEncontrados.size} assistentes não encontrados.\n\nUm arquivo de log (.txt) será baixado automaticamente com a lista dos nomes.`;
                    this.baixarLog(logNaoEncontrados);
                } else if (stats.ignorados > 0) {
                    msg += `\n⚠️ Ignorados: ${stats.ignorados} (Provavelmente sem data)`;
                }
                
                alert(msg);

                if (Gestao.Assertividade) Gestao.Assertividade.carregar();
            } else {
                if (logNaoEncontrados.size > 0) {
                    alert(`Nenhum registro foi salvo, pois ${logNaoEncontrados.size} assistentes não foram encontrados no cadastro.\nBaixando log de erros...`);
                    this.baixarLog(logNaoEncontrados);
                } else {
                    alert("Nenhum registro válido encontrado. Verifique as colunas.");
                }
            }

        } catch (e) {
            console.error(e);
            alert("Erro fatal: " + e.message);
        } finally {
            btnLabel.innerHTML = originalHtml;
            btnLabel.classList.remove('opacity-50', 'cursor-not-allowed');
            input.value = "";
        }
    },

    // --- FUNÇÃO PARA GERAR O ARQUIVO DE LOG ---
    baixarLog: function(setErros) {
        const lista = Array.from(setErros).join('\n');
        const conteudo = `RELATÓRIO DE ERROS DE IMPORTAÇÃO - ${new Date().toLocaleString()}\n\nOs seguintes nomes/IDs constam na planilha mas NÃO existem no cadastro de Usuários do sistema:\n\n${lista}\n\nCOMO RESOLVER:\n1. Vá na aba 'Usuários'.\n2. Cadastre estes nomes ou verifique se há erro de digitação na planilha.`;
        
        const blob = new Blob([conteudo], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `log_erros_importacao_${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    },

    normalizar: function(str) {
        return String(str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/ /g, '');
    },

    normalizarKey: function(k) {
        return String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    }
};